use crate::AppState;
use rusqlite::OptionalExtension;
use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

fn setting(state: &AppState, key: &str) -> Option<String> {
    state.connection().ok()?.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0)).optional().ok().flatten()
}

pub(crate) fn blur_enabled(state: &AppState) -> bool {
    setting(state,"blur").as_deref() != Some("false")
}

pub(crate) fn monitor_for(window: &tauri::WebviewWindow, state: &AppState) -> Option<tauri::Monitor> {
    let monitors = window.available_monitors().ok()?;
    let choice = setting(state,"monitor").and_then(|s| s.parse::<usize>().ok());
    choice.and_then(|i| monitors.get(i).cloned()).or_else(|| window.primary_monitor().ok().flatten()).or_else(|| monitors.into_iter().next())
}

fn capsule_position(window: &tauri::WebviewWindow, state: &AppState, width: u32) -> PhysicalPosition<i32> {
    if let (Some(x),Some(y)) = (setting(state,"capsuleX").and_then(|s|s.parse::<i32>().ok()),setting(state,"capsuleY").and_then(|s|s.parse::<i32>().ok())) {
        if let Ok(monitors) = window.available_monitors() {
            if monitors.iter().any(|m| x >= m.position().x && y >= m.position().y && x < m.position().x + m.size().width as i32 && y < m.position().y + m.size().height as i32) {
                return PhysicalPosition::new(x,y);
            }
        }
    }
    if let Some(monitor) = monitor_for(window,state) {
        let position = monitor.position();
        let size = monitor.size();
        return PhysicalPosition::new(position.x + (size.width as i32 - width as i32)/2, position.y + (12.0 * monitor.scale_factor()) as i32);
    }
    PhysicalPosition::new(500,12)
}

fn saved_size(state: &AppState, mode: &str, fallback: (f64, f64), minimum: (f64, f64), window: &tauri::WebviewWindow) -> (f64, f64) {
    let width = setting(state, &format!("{mode}Width")).and_then(|s| s.parse::<f64>().ok()).unwrap_or(fallback.0);
    let height = setting(state, &format!("{mode}Height")).and_then(|s| s.parse::<f64>().ok()).unwrap_or(fallback.1);
    let maximum = monitor_for(window, state)
        .map(|m| ((m.size().width as f64 / m.scale_factor() - 40.0).max(minimum.0), (m.size().height as f64 / m.scale_factor() - 40.0).max(minimum.1)))
        .unwrap_or((1920.0, 1080.0));
    (width.clamp(minimum.0, maximum.0), height.clamp(minimum.1, maximum.1))
}

pub fn round_window(window: &tauri::Window) -> Result<(), String> {
    let target = window.clone();
    window.run_on_main_thread(move || {
        if let Err(error) = apply_window_shape(&target) { eprintln!("Formato da janela: {error}"); }
    }).map_err(|e| e.to_string())
}

#[cfg(windows)]
unsafe fn remove_native_frame(hwnd: windows_sys::Win32::Foundation::HWND) {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    let style = GetWindowLongPtrW(hwnd,GWL_STYLE);
    // Keep WS_THICKFRAME for resizing, but remove caption painting during movement.
    let clean = style & !(WS_CAPTION as isize);
    let mut changed = style != clean;
    if style != clean { SetWindowLongPtrW(hwnd,GWL_STYLE,clean); }
    let extended = GetWindowLongPtrW(hwnd,GWL_EXSTYLE);
    let clean = extended & !((WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_STATICEDGE) as isize);
    changed |= extended != clean;
    if extended != clean { SetWindowLongPtrW(hwnd,GWL_EXSTYLE,clean); }
    if changed { SetWindowPos(hwnd,std::ptr::null_mut(),0,0,0,0,SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED); }
}

#[cfg(windows)]
unsafe extern "system" fn frameless_window_proc(hwnd: windows_sys::Win32::Foundation::HWND, message: u32, wparam: usize, lparam: isize, subclass_id: usize, _data: usize) -> isize {
    use windows_sys::Win32::UI::{Shell::{DefSubclassProc,RemoveWindowSubclass},WindowsAndMessaging::{GetCursorPos,WM_STYLECHANGED,WM_NCDESTROY,WM_NCPAINT,WM_NCACTIVATE,WM_NCCALCSIZE,WM_NCLBUTTONDOWN}};
    if message == WM_NCDESTROY { RemoveWindowSubclass(hwnd,Some(frameless_window_proc),subclass_id); }
    if message == WM_NCPAINT { return 0; }
    if message == WM_NCCALCSIZE { return 0; }
    // The Windows 11 acrylic backdrop turns solid on inactive windows. Report every
    // window as active to DWM so the editor and the projects panel stay translucent.
    if message == WM_NCACTIVATE { return DefSubclassProc(hwnd,message,1,-1); }
    if message == WM_NCLBUTTONDOWN {
        // Tao 0.35 passes a POINTS pointer here. Win32 expects packed screen coordinates.
        // Rebuild the value for both its drag command and its undecorated resize child.
        let mut point = windows_sys::Win32::Foundation::POINT { x:0,y:0 };
        if GetCursorPos(&mut point) != 0 {
            let coordinates = ((point.x as u16 as u32) | ((point.y as u16 as u32) << 16)) as isize;
            return DefSubclassProc(hwnd,message,wparam,coordinates);
        }
    }
    let result = DefSubclassProc(hwnd,message,wparam,lparam);
    // Tao updates style bits on focus and visibility changes as well as on resize.
    if message == WM_STYLECHANGED { remove_native_frame(hwnd); }
    result
}

fn apply_window_shape(window: &tauri::Window) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND};
        use windows_sys::Win32::UI::Shell::SetWindowSubclass;
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        unsafe {
            // A custom window region prevents DWM from composing the desktop through acrylic.
            // Let DWM round the actual window; the web content draws the larger inner radius.
            if SetWindowSubclass(hwnd.0,Some(frameless_window_proc),0x544f504e,0) == 0 { return Err(std::io::Error::last_os_error().to_string()); }
            remove_native_frame(hwnd.0);
            let corner = DWMWCP_ROUND;
            let result = DwmSetWindowAttribute(hwnd.0,DWMWA_WINDOW_CORNER_PREFERENCE as u32,&corner as *const _ as _,std::mem::size_of_val(&corner) as u32);
            if result < 0 { eprintln!("Cantos DWM: 0x{result:08x}"); }
            let border = DWMWA_COLOR_NONE;
            let result = DwmSetWindowAttribute(hwnd.0,DWMWA_BORDER_COLOR as u32,&border as *const _ as _,std::mem::size_of_val(&border) as u32);
            if result < 0 { eprintln!("Borda DWM: 0x{result:08x}"); }
        }
    }
    Ok(())
}

#[cfg(windows)]
fn windows_transparency_enabled() -> bool {
    use windows_sys::Win32::System::Registry::{RegGetValueW,HKEY_CURRENT_USER,RRF_RT_REG_DWORD};
    let key: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize\0".encode_utf16().collect();
    let name: Vec<u16> = "EnableTransparency\0".encode_utf16().collect();
    let mut value = 0u32;
    let mut size = std::mem::size_of::<u32>() as u32;
    unsafe { RegGetValueW(HKEY_CURRENT_USER,key.as_ptr(),name.as_ptr(),RRF_RT_REG_DWORD,std::ptr::null_mut(),&mut value as *mut _ as _,&mut size) == 0 && value != 0 }
}

#[cfg(windows)]
pub fn apply_window_material(window: &tauri::WebviewWindow, active: bool) -> Result<(), String> {
    // The accent blur paints black over WebView2 on this Windows 11 build.
    // DWM acrylic supports composition with the transparent WebView instead.
    if active && windows_transparency_enabled() {
        window_vibrancy::apply_acrylic(window,None).map_err(|e| e.to_string())
    } else {
        window_vibrancy::clear_acrylic(window).map_err(|e| e.to_string())
    }
}

#[cfg(windows)]
pub fn refresh_window_materials(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    let enabled = blur_enabled(state);
    let capsule_open = state.mode.lock().map_err(|e| e.to_string())?.as_str() == "quick";
    for (label,window) in app.webview_windows() {
        apply_window_material(&window, enabled && (label != "capsule" || capsule_open))?;
    }
    Ok(())
}

/// Creates a window from its tauri.conf.json entry the first time it is needed.
pub fn ensure_window(app: &tauri::AppHandle, label: &str) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(label) { return Ok(window); }
    let config = app.config().app.windows.iter().find(|config| config.label == label).ok_or("Janela não configurada.")?.clone();
    let window = tauri::WebviewWindowBuilder::from_config(app, &config).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?;
    window.set_shadow(true).map_err(|e| e.to_string())?;
    round_window(&window.as_ref().window())?;
    Ok(window)
}

/// Lets WebView2 trim caches and heap while a window is hidden, and restores it when shown.
pub fn set_webview_idle(window: &tauri::WebviewWindow, idle: bool) {
    #[cfg(windows)]
    {
        let _ = window.with_webview(move |webview| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL};
            use windows_core::Interface;
            if let Ok(core) = webview.controller().CoreWebView2().and_then(|core| core.cast::<ICoreWebView2_19>()) {
                let _ = core.SetMemoryUsageTargetLevel(if idle { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL });
            }
        });
    }
    #[cfg(not(windows))]
    let _ = (window, idle);
}

pub fn initialize_windows(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    for (label, window) in app.webview_windows() {
        window.set_shadow(label != "capsule").map_err(|e| e.to_string())?;
        if label == "projects" { set_webview_idle(&window, true); }
        round_window(&window.as_ref().window())?;
        #[cfg(windows)]
        if label != "capsule" {
            if let Err(error) = apply_window_material(&window, blur_enabled(&state)) { eprintln!("Material de {label}: {error}"); }
        }
    }
    Ok(())
}

pub(crate) fn clamp_position(position: PhysicalPosition<i32>, size: (u32,u32), monitor: &tauri::Monitor) -> PhysicalPosition<i32> {
    let area = monitor.work_area();
    let max_x = (area.position.x + area.size.width as i32 - size.0 as i32).max(area.position.x);
    let max_y = (area.position.y + area.size.height as i32 - size.1 as i32).max(area.position.y);
    PhysicalPosition::new(position.x.clamp(area.position.x,max_x),position.y.clamp(area.position.y,max_y))
}

pub fn reposition_capsule(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    let capsule = app.get_webview_window("capsule").ok_or("Cápsula não encontrada.")?;
    if let Some(monitor) = monitor_for(&capsule,state) {
        let area = monitor.work_area();
        let width = (240.0 * monitor.scale_factor()).round() as i32;
        capsule.set_position(PhysicalPosition::new(area.position.x + (area.size.width as i32 - width)/2,area.position.y + (12.0 * monitor.scale_factor()) as i32)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Clone, Copy)]
struct Rect { x: f64, y: f64, width: f64, height: f64 }

impl Rect {
    fn of(window: &tauri::WebviewWindow) -> Result<Self, String> {
        let position = window.outer_position().map_err(|e| e.to_string())?;
        let size = window.outer_size().map_err(|e| e.to_string())?;
        Ok(Self { x: position.x as f64, y: position.y as f64, width: size.width as f64, height: size.height as f64 })
    }
    fn lerp(self, to: Self, t: f64) -> Self {
        Self { x: self.x + (to.x - self.x) * t, y: self.y + (to.y - self.y) * t,
            width: (self.width + (to.width - self.width) * t).max(1.0), height: (self.height + (to.height - self.height) * t).max(1.0) }
    }
}

#[derive(Clone, serde::Serialize)]
struct MotionEvent { phase: &'static str, width: f64, height: f64, anchor: &'static str }

/// Closed-form damped spring from 0 to 1. `response` is the period in seconds.
fn spring(t: f64, response: f64, damping: f64) -> f64 {
    let omega = std::f64::consts::TAU / response;
    if damping >= 1.0 { return 1.0 - (1.0 + omega * t) * (-omega * t).exp(); }
    let damped = omega * (1.0 - damping * damping).sqrt();
    1.0 - (-damping * omega * t).exp() * ((damped * t).cos() + damping * omega / damped * (damped * t).sin())
}

/// Moves and resizes in one native call; separate position and size calls step visibly.
/// Asynchronous, so the animation thread never waits on the UI thread.
fn place(window: &tauri::WebviewWindow, rect: Rect) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER};
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        if unsafe { SetWindowPos(hwnd.0, std::ptr::null_mut(), rect.x.round() as i32, rect.y.round() as i32,
            rect.width.round() as i32, rect.height.round() as i32, SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER) } == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        window.set_position(PhysicalPosition::new(rect.x.round() as i32, rect.y.round() as i32)).map_err(|e| e.to_string())?;
        window.set_size(tauri::PhysicalSize::new(rect.width.round() as u32, rect.height.round() as u32)).map_err(|e| e.to_string())
    }
}

/// Springs the window between two bounds on a worker thread, one step per compositor frame.
/// Returns false when a newer request took over.
fn animate(app: &tauri::AppHandle, window: &tauri::WebviewWindow, from: Rect, to: Rect, counter: fn(&AppState) -> &AtomicU64, generation: u64, response: f64, damping: f64) -> bool {
    use std::time::{Duration, Instant};
    let state = app.state::<AppState>();
    state.animating.fetch_add(1, Ordering::SeqCst);
    let started = Instant::now();
    let finished = loop {
        if counter(&state).load(Ordering::SeqCst) != generation { break false; }
        let t = started.elapsed().as_secs_f64();
        let progress = spring(t, response, damping);
        let done = t > 0.8 || (t > 0.1 && (1.0 - progress).abs() < 0.003);
        if place(window, if done { to } else { from.lerp(to, progress) }).is_err() || done { break true; }
        #[cfg(windows)]
        if unsafe { windows_sys::Win32::Graphics::Dwm::DwmFlush() } < 0 { std::thread::sleep(Duration::from_millis(7)); }
        #[cfg(not(windows))]
        std::thread::sleep(Duration::from_millis(7));
    };
    state.animating.fetch_sub(1, Ordering::SeqCst);
    // Resize events skip the shape refresh while springing; apply it once at rest.
    let _ = round_window(&window.as_ref().window());
    finished
}

/// Where the projects panel grows from and folds into: the project button in the editor
/// header (its logical rect inside the editor), or a sliver against the editor edge.
fn projects_seed(state: &AppState, panel: Rect, main: Rect, scale: f64) -> Rect {
    if let Some([x, y, width, height]) = state.projects_origin.lock().ok().and_then(|origin| *origin) {
        return Rect { x: main.x + x * scale, y: main.y + y * scale, width: (width * scale).max(1.0), height: (height * scale).max(1.0) };
    }
    let width = (64.0 * scale).min(panel.width);
    let x = if panel.x + panel.width / 2.0 < main.x + main.width / 2.0 { panel.x + panel.width - width } else { panel.x };
    Rect { x, y: panel.y, width, height: (63.0 * scale).min(panel.height) }
}

pub fn hide_projects(app: &tauri::AppHandle) -> Result<(), String> { hide_projects_into(app, None) }

/// Folds the projects panel into `target`, or into the project button when there is none.
fn hide_projects_into(app: &tauri::AppHandle, target: Option<Rect>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let generation = state.projects_motion.fetch_add(1, Ordering::SeqCst) + 1;
    if let Some(window) = app.get_webview_window("projects") {
        let animated = setting(&state,"animations").as_deref() != Some("false");
        let main = app.get_webview_window("main").filter(|main| main.is_visible().unwrap_or(false));
        match (animated && window.is_visible().map_err(|e| e.to_string())?, main) {
            (true, Some(main)) => {
                let from = Rect::of(&window)?;
                let main = Rect::of(&main)?;
                let to = match target { Some(target) => target, None => projects_seed(&state, from, main, window.scale_factor().map_err(|e| e.to_string())?) };
                let anchor = if from.x < main.x { "right" } else { "left" };
                window.set_min_size(None::<LogicalSize<f64>>).map_err(|e| e.to_string())?;
                let _ = app.emit_to("projects","topnote:window-motion",MotionEvent { phase:"closing", width:from.width / window.scale_factor().unwrap_or(1.0), height:from.height / window.scale_factor().unwrap_or(1.0), anchor });
                let app = app.clone();
                std::thread::spawn(move || {
                    if animate(&app, &window, from, to, |state| &state.projects_motion, generation, 0.22, 1.0) {
                        let _ = window.hide(); set_webview_idle(&window, true);
                        let _ = app.emit_to("projects","topnote:window-motion",MotionEvent { phase:"idle", width:0.0, height:0.0, anchor:"center" });
                    }
                });
            }
            _ => { window.hide().map_err(|e| e.to_string())?; set_webview_idle(&window, true); }
        }
    }
    app.emit_to("main","topnote:projects-visible",false).map_err(|e| e.to_string())
}

pub fn show_projects(app: &tauri::AppHandle, selected_id: Option<String>, origin: Option<[f64; 4]>) -> Result<(), String> {
    let state = app.state::<AppState>();
    *state.projects_origin.lock().map_err(|e| e.to_string())? = origin;
    let main = app.get_webview_window("main").ok_or("Editor não encontrado.")?;
    let projects = app.get_webview_window("projects").ok_or("Seletor de projetos não encontrado.")?;
    let generation = state.projects_motion.fetch_add(1, Ordering::SeqCst) + 1;
    let was_visible = projects.is_visible().map_err(|e| e.to_string())?;
    let position = main.outer_position().map_err(|e| e.to_string())?;
    let size = main.outer_size().map_err(|e| e.to_string())?;
    let scale = main.scale_factor().map_err(|e| e.to_string())?;
    let monitor = main.current_monitor().map_err(|e| e.to_string())?;
    let width = (231.0 * scale).round() as u32;
    let height = (360.0 * scale).round() as u32;
    let mut target = PhysicalPosition::new(position.x - width as i32 - (8.0 * scale) as i32, position.y);
    if let Some(monitor) = monitor {
        if target.x < monitor.work_area().position.x { target.x = position.x + size.width as i32 + (8.0 * scale) as i32; }
        target = clamp_position(target,(width,height),&monitor);
    }
    let panel = Rect { x:target.x as f64, y:target.y as f64, width:width as f64, height:height as f64 };
    let animated = setting(&state,"animations").as_deref() != Some("false");
    let from = if !animated { panel } else if was_visible { Rect::of(&projects)? }
        else { projects_seed(&state, panel, Rect { x:position.x as f64, y:position.y as f64, width:size.width as f64, height:size.height as f64 }, scale) };
    projects.set_min_size(None::<LogicalSize<f64>>).map_err(|e| e.to_string())?;
    projects.set_position(PhysicalPosition::new(from.x.round() as i32, from.y.round() as i32)).map_err(|e| e.to_string())?;
    projects.set_size(tauri::PhysicalSize::new(from.width.round() as u32, from.height.round() as u32)).map_err(|e| e.to_string())?;
    if animated { let _ = app.emit_to("projects","topnote:window-motion",MotionEvent { phase:"opening", width:231.0, height:360.0, anchor:if panel.x < position.x as f64 { "right" } else { "left" } }); }
    projects.set_always_on_top(main.is_always_on_top().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    set_webview_idle(&projects, false);
    projects.show().map_err(|e| e.to_string())?;
    projects.set_focus().map_err(|e| e.to_string())?;
    round_window(&projects.as_ref().window())?;
    #[cfg(windows)]
    if let Err(error) = apply_window_material(&projects, blur_enabled(&state)) { eprintln!("Material do seletor: {error}"); }
    app.emit_to("projects","topnote:select-project",selected_id).map_err(|e| e.to_string())?;
    let (handle, window) = (app.clone(), projects.clone());
    std::thread::spawn(move || {
        if animate(&handle, &window, from, panel, |state| &state.projects_motion, generation, 0.28, 0.92) {
            let _ = window.set_min_size(Some(LogicalSize::new(210.0,240.0)));
            let _ = handle.emit_to("projects","topnote:window-motion",MotionEvent { phase:"idle", width:0.0, height:0.0, anchor:"center" });
        }
    });
    app.emit_to("main","topnote:projects-visible",true).map_err(|e| e.to_string())
}

pub fn set_window_mode(app: &tauri::AppHandle, mode: &str, animated: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    let generation = state.motion.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    let window = app.get_webview_window("main").ok_or("Janela principal não encontrada.")?;
    let capsule = app.get_webview_window("capsule").ok_or("Cápsula não encontrada.")?;
    let previous = state.mode.lock().map_err(|e| e.to_string())?.clone();
    if !["capsule","quick","workspace","hidden"].contains(&mode) { return Err("Modo de janela inválido.".into()); }
    let folding = mode == "capsule" && previous == "quick";
    if mode != "quick" && !folding { hide_projects(app)?; }
    if mode == "hidden" {
        window.hide().map_err(|e| e.to_string())?;
        set_webview_idle(&window, true);
        capsule.hide().map_err(|e| e.to_string())?;
        if let Some(dialog) = app.get_webview_window("dialog") { dialog.destroy().map_err(|e| e.to_string())?; }
        *state.mode.lock().map_err(|e| e.to_string())? = mode.into();
        let _ = app.emit("topnote:mode",mode);
        return Ok(());
    }
    let scale = capsule.scale_factor().map_err(|e| e.to_string())?;
    let capsule_width = (240.0 * scale) as u32;
    let base = if capsule.is_visible().map_err(|e| e.to_string())? && (previous == "quick" || previous == "capsule") {
        capsule.outer_position().map_err(|e| e.to_string())?
    } else { capsule_position(&capsule,&state,capsule_width) };
    let top_setting = setting(&state,"alwaysOnTop").unwrap_or_else(|| "always".into());
    let animated = animated && setting(&state,"animations").as_deref() != Some("false");
    let capsule_rect = Rect { x: base.x as f64, y: base.y as f64, width: 240.0 * scale, height: 52.0 * scale };
    let window_visible = window.is_visible().map_err(|e| e.to_string())?;
    let mut opening: Option<(Rect, Rect)> = None;
    match mode {
        "capsule" if animated && previous == "quick" && window_visible => {
            // The panel folds back into the capsule, then hides behind it.
            let from = Rect::of(&window)?;
            // Both panels fold into the capsule together; the button they came from is leaving too.
            hide_projects_into(app, Some(capsule_rect))?;
            window.set_min_size(None::<LogicalSize<f64>>).map_err(|e| e.to_string())?;
            let _ = app.emit_to("main","topnote:window-motion",MotionEvent { phase:"closing", width:from.width / scale, height:from.height / scale, anchor:"center" });
            capsule.set_size(LogicalSize::new(240.0,52.0)).map_err(|e| e.to_string())?;
            capsule.set_position(base).map_err(|e| e.to_string())?;
            capsule.set_always_on_top(top_setting == "always").map_err(|e| e.to_string())?;
            capsule.show().map_err(|e| e.to_string())?;
            let (app, window) = (app.clone(), window.clone());
            std::thread::spawn(move || {
                if animate(&app, &window, from, capsule_rect, |state| &state.motion, generation, 0.24, 1.0) {
                    let _ = window.hide();
                    set_webview_idle(&window, true);
                    let _ = app.emit_to("main","topnote:window-motion",MotionEvent { phase:"idle", width:0.0, height:0.0, anchor:"center" });
                }
            });
        }
        "capsule" => {
            if folding { hide_projects(app)?; }
            window.hide().map_err(|e| e.to_string())?;
            set_webview_idle(&window, true);
            capsule.set_size(LogicalSize::new(240.0,52.0)).map_err(|e| e.to_string())?;
            capsule.set_position(base).map_err(|e| e.to_string())?;
            capsule.set_always_on_top(top_setting == "always").map_err(|e| e.to_string())?;
            capsule.show().map_err(|e| e.to_string())?;
        }
        "quick" => {
            let (width,height) = saved_size(&state,"quickPanel",(660.0,638.0),(420.0,340.0),&window);
            let animate_open = animated && previous != mode && (previous == "capsule" || previous == "hidden");
            if !animate_open {
                window.set_min_size(Some(LogicalSize::new(420.0,340.0))).map_err(|e| e.to_string())?;
                window.set_resizable(true).map_err(|e| e.to_string())?;
            }
            if previous != mode {
                let mut target = PhysicalPosition::new(base.x - (((width-240.0)/2.0)*scale) as i32,base.y + (64.0*scale) as i32);
                if let Some(monitor) = capsule.current_monitor().map_err(|e| e.to_string())? { target = clamp_position(target,((width*scale) as u32,(height*scale) as u32),&monitor); }
                if animate_open {
                    // Grow out of the capsule, or from wherever an interrupted collapse left the panel.
                    let from = if window_visible { Rect::of(&window)? } else { capsule_rect };
                    window.set_min_size(None::<LogicalSize<f64>>).map_err(|e| e.to_string())?;
                    window.set_resizable(true).map_err(|e| e.to_string())?;
                    window.set_position(PhysicalPosition::new(from.x.round() as i32, from.y.round() as i32)).map_err(|e| e.to_string())?;
                    window.set_size(tauri::PhysicalSize::new(from.width.round() as u32, from.height.round() as u32)).map_err(|e| e.to_string())?;
                    let _ = app.emit_to("main","topnote:window-motion",MotionEvent { phase:"opening", width, height, anchor:"center" });
                    opening = Some((from, Rect { x:target.x as f64, y:target.y as f64, width:width * scale, height:height * scale }));
                } else {
                    window.set_size(LogicalSize::new(width,height)).map_err(|e| e.to_string())?;
                    window.set_position(target).map_err(|e| e.to_string())?;
                }
            }
            window.set_skip_taskbar(true).map_err(|e| e.to_string())?;
            window.set_always_on_top(top_setting != "never").map_err(|e| e.to_string())?;
            capsule.set_position(base).map_err(|e| e.to_string())?;
            capsule.set_always_on_top(top_setting != "never").map_err(|e| e.to_string())?;
            capsule.show().map_err(|e| e.to_string())?;
        }
        "workspace" => {
            capsule.hide().map_err(|e| e.to_string())?;
            window.set_always_on_top(top_setting == "always").map_err(|e| e.to_string())?;
            window.set_skip_taskbar(false).map_err(|e| e.to_string())?;
            window.set_resizable(true).map_err(|e| e.to_string())?;
            let (width,height) = monitor_for(&window,&state).map(|m| ((m.size().width as f64 / m.scale_factor()).min(1280.0).max(800.0),(m.size().height as f64 / m.scale_factor()).min(820.0).max(550.0))).unwrap_or((1200.0,760.0));
            let (width,height) = saved_size(&state,"workspace",(width,height),(780.0,520.0),&window);
            window.set_min_size(Some(LogicalSize::new(780.0,520.0))).map_err(|e| e.to_string())?;
            if previous != mode {
                window.set_size(LogicalSize::new(width,height)).map_err(|e| e.to_string())?;
                window.center().map_err(|e| e.to_string())?;
            }
        }
        _ => return Err("Modo de janela inválido.".into()),
    }
    if mode != "capsule" {
        #[cfg(windows)]
        if let Err(error) = apply_window_material(&window, blur_enabled(&state)) { eprintln!("Material do editor: {error}"); }
        set_webview_idle(&window, false);
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    round_window(&window.as_ref().window())?;
    round_window(&capsule.as_ref().window())?;
    *state.mode.lock().map_err(|e| e.to_string())? = mode.into();
    let _ = app.emit("topnote:mode",mode);
    if let Some((from, to)) = opening {
        let (app, window) = (app.clone(), window.clone());
        std::thread::spawn(move || {
            // A WebView that was hidden needs a couple of frames for its first paint;
            // springing during that paint is what made the start stutter.
            #[cfg(windows)]
            for _ in 0..2 { unsafe { windows_sys::Win32::Graphics::Dwm::DwmFlush(); } }
            if animate(&app, &window, from, to, |state| &state.motion, generation, 0.3, 0.92) {
                let _ = window.set_min_size(Some(LogicalSize::new(420.0,340.0)));
                let _ = app.emit_to("main","topnote:window-motion",MotionEvent { phase:"idle", width:0.0, height:0.0, anchor:"center" });
            }
        });
    }
    Ok(())
}

pub fn change_hotkey(app: &tauri::AppHandle, state: &AppState, value: &str) -> Result<(), String> {
    let shortcut = Shortcut::from_str(value).map_err(|_| "Atalho inválido. Use Ctrl+Shift+Space, por exemplo.".to_string())?;
    let search = Shortcut::from_str("Ctrl+K").map_err(|e| e.to_string())?;
    if shortcut == search { return Err("Ctrl+K está reservado para pesquisa.".into()); }
    let old = state.hotkey.lock().map_err(|e| e.to_string())?.clone();
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())?;
    if let Err(error) = app.global_shortcut().register(shortcut) {
        if let Ok(previous) = Shortcut::from_str(&old) { let _ = app.global_shortcut().register(previous); }
        let _ = app.global_shortcut().register(search);
        return Err(format!("Não foi possível registrar o atalho: {error}"));
    }
    if let Err(error) = app.global_shortcut().register(search) {
        let _ = app.global_shortcut().unregister_all();
        if let Ok(previous) = Shortcut::from_str(&old) { let _ = app.global_shortcut().register(previous); }
        let _ = app.global_shortcut().register(search);
        return Err(format!("Não foi possível registrar Ctrl+K: {error}"));
    }
    *state.hotkey.lock().map_err(|e| e.to_string())? = value.into();
    Ok(())
}

pub fn initialize_hotkey(app: &tauri::AppHandle, state: &AppState) {
    let value = setting(state,"hotkey").unwrap_or_else(|| "Ctrl+Shift+Space".into());
    if let Err(error) = change_hotkey(app,state,&value) { eprintln!("Atalho global: {error}"); }
}
