//! The capsule is a small native layered window drawn with GDI+. It needs no WebView, so
//! while only the capsule is on screen the editor's WebView can be unloaded entirely.
//! Every Win32 call runs on the main thread, which owns the window and pumps its messages.

use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

/// Logical size of the capsule, matching the previous web capsule.
pub const WIDTH: f64 = 240.0;
pub const HEIGHT: f64 = 52.0;
/// Transparent band at the top of the window where the paper clip sticks out above the card.
const CLIP_OVERHANG: f32 = 8.0;
/// Opacity of the capsule at rest, as a fraction of 255.
const IDLE_ALPHA: f64 = 26.0;
const DRAG_THRESHOLD: i32 = 5;

#[derive(Clone, Copy)]
pub struct Geometry { pub x: i32, pub y: i32, pub width: i32, pub height: i32, pub scale: f64 }

struct Capsule {
    hwnd: isize,
    x: i32,
    y: i32,
    scale: f64,
    ui_scale: f64,
    dark: bool,
    visible: bool,
    hovered: bool,
    expanded: bool,
    press: Option<Press>,
    alpha: f64,
    /// Opacity and time the current fade started from.
    fade: Option<(f64, std::time::Instant)>,
    pill: bool,
}

#[derive(Clone, Copy)]
struct Press { cursor: (i32, i32), origin: (i32, i32), dragging: bool }

impl Capsule {
    fn hot(&self) -> bool { self.hovered || self.expanded || self.press.is_some_and(|p| p.dragging) }
    fn target_alpha(&self) -> f64 { if self.hot() { 255.0 } else { IDLE_ALPHA } }
    fn size(&self) -> (i32, i32) { ((WIDTH * self.scale).round() as i32, (HEIGHT * self.scale).round() as i32) }
}

static STATE: Mutex<Capsule> = Mutex::new(Capsule {
    hwnd: 0, x: 0, y: 0, scale: 1.0, ui_scale: 1.0, dark: true, visible: false,
    hovered: false, expanded: false, press: None, alpha: IDLE_ALPHA, fade: None, pill: false,
});
static APP: OnceLock<AppHandle> = OnceLock::new();

/// What the capsule asks of the app; native.rs routes these to the editor.
pub enum Action { Toggle, Favorites, NewNote, Hovered, Moved(i32, i32), ThemeChanged }

fn state() -> std::sync::MutexGuard<'static, Capsule> { STATE.lock().unwrap_or_else(|e| e.into_inner()) }

fn on_main(f: impl FnOnce() + Send + 'static) {
    if let Some(app) = APP.get() { let _ = app.run_on_main_thread(f); }
}

pub fn geometry() -> Geometry {
    let s = state();
    let (width, height) = s.size();
    Geometry { x: s.x, y: s.y, width, height, scale: s.scale }
}

pub fn is_visible() -> bool { state().visible }

/// Places the capsule at a physical position and shows it. `scale` is the target monitor's factor.
pub fn show(x: i32, y: i32, scale: f64) {
    {
        let mut s = state();
        s.x = x; s.y = y; s.scale = scale; s.visible = true;
    }
    on_main(|| unsafe { imp::present(true) });
}

pub fn hide() {
    {
        let mut s = state();
        s.visible = false; s.hovered = false; s.press = None;
    }
    on_main(|| unsafe { imp::hide() });
}

pub fn set_expanded(expanded: bool) {
    {
        let mut s = state();
        if s.expanded == expanded { return; }
        s.expanded = expanded;
    }
    // The chevron flips, so the bitmap is redrawn before fading to the new opacity.
    on_main(|| unsafe { imp::present(false) });
}

pub fn set_topmost(topmost: bool) { on_main(move || unsafe { imp::set_topmost(topmost) }); }

pub fn set_appearance(dark: bool, ui_scale: f64) {
    {
        let mut s = state();
        s.dark = dark; s.ui_scale = ui_scale.clamp(0.8, 1.3);
    }
    on_main(|| unsafe { imp::present(false) });
}

/// Creates the hidden capsule window. Must run on the main thread (the Tauri setup hook does).
pub fn create(app: &AppHandle, on_action: fn(&AppHandle, Action)) -> Result<(), String> {
    let _ = APP.set(app.clone());
    let _ = ACTION.set(on_action);
    unsafe { imp::create() }
}

static ACTION: OnceLock<fn(&AppHandle, Action)> = OnceLock::new();

fn dispatch(action: Action) {
    if let (Some(app), Some(handler)) = (APP.get(), ACTION.get()) { handler(app, action); }
}

/// Whether Windows apps are set to the light theme.
pub fn system_prefers_light() -> bool {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
        let key: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize\0".encode_utf16().collect();
        let name: Vec<u16> = "AppsUseLightTheme\0".encode_utf16().collect();
        let mut value = 0u32;
        let mut size = std::mem::size_of::<u32>() as u32;
        RegGetValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr(), RRF_RT_REG_DWORD, std::ptr::null_mut(), &mut value as *mut _ as _, &mut size) == 0 && value != 0
    }
    #[cfg(not(windows))]
    false
}

#[cfg(windows)]
mod imp {
    use super::*;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, SIZE, WPARAM};
    use windows_sys::Win32::Graphics::Gdi::*;
    use windows_sys::Win32::Graphics::GdiPlus::*;
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::HiDpi::GetDpiForWindow;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{ReleaseCapture, SetCapture, TrackMouseEvent, TME_LEAVE, TRACKMOUSEEVENT};
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    use windows_sys::Win32::Media::{timeBeginPeriod, timeEndPeriod};
    use std::sync::atomic::{AtomicBool, Ordering};

    const PIXEL_FORMAT_32BPP_PARGB: i32 = 0x000E200B;
    const FADE_TIMER: usize = 1;
    const FADE_IN_SECS: f64 = 0.16;
    const FADE_OUT_SECS: f64 = 0.28;
    /// Whether this capsule raised the system timer resolution for a running fade.
    static FINE_TIMER: AtomicBool = AtomicBool::new(false);

    /// A 1 ms system timer only while a fade runs, so it steps at about 120 Hz instead of 64.
    unsafe fn fine_timer(on: bool) {
        if FINE_TIMER.swap(on, Ordering::SeqCst) != on { if on { timeBeginPeriod(1); } else { timeEndPeriod(1); } }
    }
    const WM_MOUSELEAVE: u32 = 0x02A3;

    fn hwnd() -> HWND { state().hwnd as HWND }

    pub unsafe fn create() -> Result<(), String> {
        let mut token = 0usize;
        let input = GdiplusStartupInput { GdiplusVersion: 1, ..Default::default() };
        if GdiplusStartup(&mut token, &input, std::ptr::null_mut()) != 0 { return Err("GDI+ não iniciou.".into()); }
        let instance = GetModuleHandleW(std::ptr::null());
        let class: Vec<u16> = "TopNoteCapsule\0".encode_utf16().collect();
        let wc = WNDCLASSW {
            lpfnWndProc: Some(window_proc), hInstance: instance, lpszClassName: class.as_ptr(),
            hCursor: LoadCursorW(std::ptr::null_mut(), IDC_HAND), ..std::mem::zeroed()
        };
        RegisterClassW(&wc);
        let title: Vec<u16> = "TopNote\0".encode_utf16().collect();
        let hwnd = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST,
            class.as_ptr(), title.as_ptr(), WS_POPUP, 0, 0, 1, 1,
            std::ptr::null_mut(), std::ptr::null_mut(), instance, std::ptr::null(),
        );
        if hwnd.is_null() { return Err(std::io::Error::last_os_error().to_string()); }
        let mut s = state();
        s.hwnd = hwnd as isize;
        s.scale = GetDpiForWindow(hwnd) as f64 / 96.0;
        std::result::Result::Ok(())
    }

    pub unsafe fn present(show: bool) {
        let hwnd = hwnd();
        if hwnd.is_null() { return; }
        if !state().visible { return; }
        redraw();
        if show { ShowWindow(hwnd, SW_SHOWNOACTIVATE); }
        animate();
    }

    pub unsafe fn hide() {
        let hwnd = hwnd();
        if hwnd.is_null() { return; }
        KillTimer(hwnd, FADE_TIMER);
        fine_timer(false);
        ShowWindow(hwnd, SW_HIDE);
        let mut s = state();
        s.alpha = IDLE_ALPHA;
        s.fade = None;
        s.pill = false;
    }

    pub unsafe fn set_topmost(topmost: bool) {
        let hwnd = hwnd();
        if hwnd.is_null() { return; }
        SetWindowPos(hwnd, if topmost { HWND_TOPMOST } else { HWND_NOTOPMOST }, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }

    /// Starts fading towards the current state's opacity.
    pub unsafe fn animate() {
        let hwnd = hwnd();
        if hwnd.is_null() { return; }
        let (hot, pill) = { let s = state(); (s.hot(), s.pill) };
        // The glass pill appears before fading in and leaves after fading out.
        if hot && !pill { state().pill = true; redraw(); }
        { let mut s = state(); s.fade = Some((s.alpha, std::time::Instant::now())); }
        fine_timer(true);
        SetTimer(hwnd, FADE_TIMER, 8, None);
    }

    /// One frame of the fade: a cubic ease-out over a fixed time, whatever the timer jitter.
    unsafe fn step() {
        let hwnd = hwnd();
        let (alpha, done, drop_pill) = {
            let mut s = state();
            let target = s.target_alpha();
            let (from, start) = s.fade.unwrap_or((s.alpha, std::time::Instant::now()));
            let duration = if target > from { FADE_IN_SECS } else { FADE_OUT_SECS };
            let t = (start.elapsed().as_secs_f64() / duration).min(1.0);
            s.alpha = from + (target - from) * (1.0 - (1.0 - t).powi(3));
            let done = t >= 1.0;
            if done { s.alpha = target; s.fade = None; }
            let drop_pill = done && !s.hot() && s.pill;
            if drop_pill { s.pill = false; }
            (s.alpha, done, drop_pill)
        };
        if done { KillTimer(hwnd, FADE_TIMER); fine_timer(false); }
        if drop_pill { redraw(); return; }
        let blend = BLENDFUNCTION { BlendOp: AC_SRC_OVER as u8, BlendFlags: 0, SourceConstantAlpha: alpha.round() as u8, AlphaFormat: AC_SRC_ALPHA as u8 };
        UpdateLayeredWindow(hwnd, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null_mut(), std::ptr::null(), 0, &blend, ULW_ALPHA);
    }

    fn argb(a: u8, r: u8, g: u8, b: u8) -> u32 { (a as u32) << 24 | (r as u32) << 16 | (g as u32) << 8 | b as u32 }

    /// A silver paper clip drawn on a 14 × 42 grid, tilted a little.
    /// `x` is the centre of its top, `unit` the size of one grid step in pixels.
    unsafe fn paper_clip(graphics: *mut GpGraphics, x: f32, y: f32, unit: f32) {
        let mut wire: *mut GpPath = std::ptr::null_mut();
        GdipCreatePath(0, &mut wire);
        GdipAddPathLine(wire, 13.0, 9.0, 13.0, 35.0);
        GdipAddPathArc(wire, 1.0, 29.0, 12.0, 12.0, 0.0, 180.0);
        GdipAddPathLine(wire, 1.0, 35.0, 1.0, 5.0);
        GdipAddPathArc(wire, 1.0, 1.0, 8.0, 8.0, 180.0, 180.0);
        GdipAddPathLine(wire, 9.0, 5.0, 9.0, 35.0);
        GdipAddPathArc(wire, 5.0, 33.0, 4.0, 4.0, 0.0, 180.0);
        GdipAddPathLine(wire, 5.0, 35.0, 5.0, 13.0);
        // Shadow, dark edge, bright metal and a thin glint, each offset a touch.
        for (offset, width, color) in [(0.6, 2.3, argb(60, 0, 0, 0)), (0.0, 2.1, argb(255, 120, 126, 134)), (0.0, 1.25, argb(255, 226, 230, 236)), (-0.25, 0.45, argb(220, 255, 255, 255))] {
            GdipResetWorldTransform(graphics);
            GdipTranslateWorldTransform(graphics, x, y, MatrixOrderPrepend);
            GdipRotateWorldTransform(graphics, -9.0, MatrixOrderPrepend);
            GdipScaleWorldTransform(graphics, unit, unit, MatrixOrderPrepend);
            GdipTranslateWorldTransform(graphics, offset - 7.0, offset, MatrixOrderPrepend);
            let mut pen: *mut GpPen = std::ptr::null_mut();
            GdipCreatePen1(color, width, UnitWorld, &mut pen);
            GdipSetPenStartCap(pen, LineCapRound);
            GdipSetPenEndCap(pen, LineCapRound);
            GdipSetPenLineJoin(pen, LineJoinRound);
            GdipDrawPath(graphics, pen, wire);
            GdipDeletePen(pen);
        }
        GdipResetWorldTransform(graphics);
        GdipDeletePath(wire);
    }

    /// Renders the capsule into a premultiplied bitmap and hands it to the compositor.
    unsafe fn redraw() {
        let (hwnd, x, y, (width, height), scale, ui_scale, dark, expanded, pill, alpha) = {
            let s = state();
            (s.hwnd as HWND, s.x, s.y, s.size(), s.scale, s.ui_scale, s.dark, s.expanded, s.pill, s.alpha)
        };
        if hwnd.is_null() || width <= 0 || height <= 0 { return; }
        let screen = GetDC(std::ptr::null_mut());
        let memory = CreateCompatibleDC(screen);
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        info.bmiHeader.biWidth = width;
        info.bmiHeader.biHeight = -height;
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let dib = CreateDIBSection(memory, &info, DIB_RGB_COLORS, &mut bits, std::ptr::null_mut(), 0);
        if dib.is_null() { DeleteDC(memory); ReleaseDC(std::ptr::null_mut(), screen); return; }
        let previous = SelectObject(memory, dib);

        let mut bitmap: *mut GpBitmap = std::ptr::null_mut();
        GdipCreateBitmapFromScan0(width, height, width * 4, PIXEL_FORMAT_32BPP_PARGB, bits as *const u8, &mut bitmap);
        let mut graphics: *mut GpGraphics = std::ptr::null_mut();
        GdipGetImageGraphicsContext(bitmap as *mut GpImage, &mut graphics);
        GdipSetSmoothingMode(graphics, SmoothingModeAntiAlias);
        GdipSetPixelOffsetMode(graphics, PixelOffsetModeHalf);
        GdipSetTextRenderingHint(graphics, TextRenderingHintAntiAliasGridFit);
        GdipGraphicsClear(graphics, 0);
        let (w, h, s) = (width as f32, height as f32, scale as f32);

        // Charcoal card with softly rounded corners. The window is taller than the card so the
        // paper clip can stick out above its top edge.
        let top = CLIP_OVERHANG * s;
        let body_h = h - top;
        let mut path: *mut GpPath = std::ptr::null_mut();
        GdipCreatePath(0, &mut path);
        let (left, right, bottom, d) = (0.5, w - 0.5, h - 0.5, 2.0 * 9.0 * s);
        GdipAddPathArc(path, left, top + 0.5, d, d, 180.0, 90.0);
        GdipAddPathArc(path, right - d, top + 0.5, d, d, 270.0, 90.0);
        GdipAddPathArc(path, right - d, bottom - d, d, d, 0.0, 90.0);
        GdipAddPathArc(path, left, bottom - d, d, d, 90.0, 90.0);
        GdipClosePathFigure(path);
        // At rest the card is all but invisible, yet never fully transparent: a layered window lets
        // the mouse through pixels with zero alpha, so the gaps between the labels would not hover.
        let mut fill: *mut GpSolidFill = std::ptr::null_mut();
        GdipCreateSolidFill(if pill { argb(255, 43, 43, 43) } else { argb(12, 0, 0, 0) }, &mut fill);
        GdipFillPath(graphics, fill as *mut GpBrush, path);
        GdipDeleteBrush(fill as *mut GpBrush);
        if pill {
            let mut pen: *mut GpPen = std::ptr::null_mut();
            GdipCreatePen1(argb(22, 255, 255, 255), s.max(1.0), UnitPixel, &mut pen);
            GdipDrawPath(graphics, pen, path);
            GdipDeletePen(pen);
        }
        GdipDeletePath(path);

        // Accent dot: the app's blue, with a highlight like a drop of glass.
        let (dx, dd) = (20.0 * s, 10.0 * s);
        let dy = top + (body_h - dd) / 2.0;
        let dot_bounds = RectF { X: dx, Y: dy, Width: dd, Height: dd };
        let mut dot: *mut GpLineGradient = std::ptr::null_mut();
        GdipCreateLineBrushFromRect(&dot_bounds, argb(255, 128, 182, 255), argb(255, 52, 108, 238), LinearGradientModeVertical, WrapModeTileFlipXY, &mut dot);
        GdipFillEllipse(graphics, dot as *mut GpBrush, dx, dy, dd, dd);
        GdipDeleteBrush(dot as *mut GpBrush);
        let mut shine: *mut GpSolidFill = std::ptr::null_mut();
        GdipCreateSolidFill(argb(150, 255, 255, 255), &mut shine);
        GdipFillEllipse(graphics, shine as *mut GpBrush, dx + dd * 0.25, dy + dd * 0.14, dd * 0.36, dd * 0.28);
        GdipDeleteBrush(shine as *mut GpBrush);

        // On the card the ink is always light; at rest it follows the theme over the desktop.
        let light = dark || pill;
        let ink = if light { argb(255, 242, 245, 252) } else { argb(255, 28, 40, 56) };
        let mut brush: *mut GpSolidFill = std::ptr::null_mut();
        GdipCreateSolidFill(ink, &mut brush);
        let mut family: *mut GpFontFamily = std::ptr::null_mut();
        for name in ["Segoe UI Variable Display Semib", "Segoe UI Variable Display Semibold", "Segoe UI Semibold", "Segoe UI"] {
            let wide: Vec<u16> = format!("{name}\0").encode_utf16().collect();
            if GdipCreateFontFamilyFromName(wide.as_ptr(), std::ptr::null_mut(), &mut family) == 0 { break; }
        }
        if !family.is_null() {
            let mut font: *mut GpFont = std::ptr::null_mut();
            GdipCreateFont(family, 16.0 * s * ui_scale as f32, FontStyleRegular, UnitPixel, &mut font);
            let mut format: *mut GpStringFormat = std::ptr::null_mut();
            GdipCreateStringFormat(0x1000 /* StringFormatFlagsNoWrap */, 0, &mut format);
            GdipSetStringFormatLineAlign(format, StringAlignmentCenter);
            let text: Vec<u16> = "TopNote".encode_utf16().collect();
            let layout = RectF { X: 38.0 * s, Y: top, Width: w - 90.0 * s, Height: body_h };
            GdipDrawString(graphics, text.as_ptr(), text.len() as i32, font, &layout, format, brush as *const GpBrush);
            GdipDeleteStringFormat(format);
            GdipDeleteFont(font);
            GdipDeleteFontFamily(family);
        }
        GdipDeleteBrush(brush as *mut GpBrush);

        // Lucide chevron (15 px icon in a 24 px grid), drawn with round caps.
        let k = 15.0 * s / 24.0;
        let (cx, cy) = (w - 20.0 * s, top + body_h / 2.0);
        let flip = if expanded { -1.0 } else { 1.0 };
        let points = [
            PointF { X: cx - 6.0 * k, Y: cy - 3.0 * k * flip },
            PointF { X: cx, Y: cy + 3.0 * k * flip },
            PointF { X: cx + 6.0 * k, Y: cy - 3.0 * k * flip },
        ];
        let mut pen: *mut GpPen = std::ptr::null_mut();
        GdipCreatePen1(if light { argb(255, 232, 238, 250) } else { ink }, 2.2 * k, UnitPixel, &mut pen);
        GdipSetPenStartCap(pen, LineCapRound);
        GdipSetPenEndCap(pen, LineCapRound);
        GdipSetPenLineJoin(pen, LineJoinRound);
        GdipDrawLines(graphics, pen, points.as_ptr(), points.len() as i32);
        GdipDeletePen(pen);

        if pill { paper_clip(graphics, w * 0.79, 0.5 * s, 0.86 * s); }

        GdipDeleteGraphics(graphics);
        GdipDisposeImage(bitmap as *mut GpImage);
        let size = SIZE { cx: width, cy: height };
        let source = POINT { x: 0, y: 0 };
        let target = POINT { x, y };
        let blend = BLENDFUNCTION { BlendOp: AC_SRC_OVER as u8, BlendFlags: 0, SourceConstantAlpha: alpha.round() as u8, AlphaFormat: AC_SRC_ALPHA as u8 };
        UpdateLayeredWindow(hwnd, screen, &target, &size, memory, &source, 0, &blend, ULW_ALPHA);
        SelectObject(memory, previous);
        DeleteObject(dib);
        DeleteDC(memory);
        ReleaseDC(std::ptr::null_mut(), screen);
    }

    fn cursor() -> (i32, i32) {
        let mut point = POINT { x: 0, y: 0 };
        unsafe { GetCursorPos(&mut point); }
        (point.x, point.y)
    }

    unsafe extern "system" fn window_proc(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        match message {
            WM_MOUSEACTIVATE => return MA_NOACTIVATE as LRESULT,
            WM_TIMER if wparam == FADE_TIMER => { step(); return 0; }
            WM_MOUSEMOVE => {
                let entering = { let mut s = state(); let entering = !s.hovered; s.hovered = true; entering };
                if entering {
                    let mut track = TRACKMOUSEEVENT { cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32, dwFlags: TME_LEAVE, hwndTrack: hwnd, dwHoverTime: 0 };
                    TrackMouseEvent(&mut track);
                    animate();
                    dispatch(Action::Hovered);
                }
                let press = state().press;
                if let Some(mut press) = press {
                    let (x, y) = cursor();
                    let (dx, dy) = (x - press.cursor.0, y - press.cursor.1);
                    if !press.dragging && (dx.abs() >= DRAG_THRESHOLD || dy.abs() >= DRAG_THRESHOLD) { press.dragging = true; }
                    if press.dragging {
                        let (nx, ny) = (press.origin.0 + dx, press.origin.1 + dy);
                        { let mut s = state(); s.press = Some(press); s.x = nx; s.y = ny; }
                        SetWindowPos(hwnd, std::ptr::null_mut(), nx, ny, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
                    }
                }
                return 0;
            }
            WM_MOUSELEAVE => {
                let pressed = { let mut s = state(); s.hovered = false; s.press.is_some() };
                if !pressed { animate(); }
                return 0;
            }
            WM_LBUTTONDOWN => {
                {
                    let mut s = state();
                    s.press = Some(Press { cursor: cursor(), origin: (s.x, s.y), dragging: false });
                }
                SetCapture(hwnd);
                return 0;
            }
            WM_LBUTTONUP => {
                let press = state().press.take();
                ReleaseCapture();
                match press {
                    Some(Press { dragging: true, .. }) => { let (x, y) = { let s = state(); (s.x, s.y) }; dispatch(Action::Moved(x, y)); animate(); }
                    Some(_) => dispatch(Action::Toggle),
                    None => {}
                }
                return 0;
            }
            WM_CAPTURECHANGED => { state().press = None; return 0; }
            WM_RBUTTONUP => { dispatch(Action::Favorites); return 0; }
            WM_MBUTTONUP => { dispatch(Action::NewNote); return 0; }
            WM_DPICHANGED => {
                state().scale = ((wparam >> 16) & 0xffff) as f64 / 96.0;
                redraw();
                return 0;
            }
            WM_SETTINGCHANGE => { dispatch(Action::ThemeChanged); }
            _ => {}
        }
        DefWindowProcW(hwnd, message, wparam, lparam)
    }
}

#[cfg(not(windows))]
mod imp {
    pub unsafe fn create() -> Result<(), String> { Ok(()) }
    pub unsafe fn present(_show: bool) {}
    pub unsafe fn hide() {}
    pub unsafe fn set_topmost(_topmost: bool) {}
    pub unsafe fn animate() {}
}
