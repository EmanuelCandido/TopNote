use crate::{capsule, AppState};
use std::str::FromStr;
use std::sync::atomic::Ordering;
use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

/// How long the editor may stay hidden before its WebView is unloaded. Only the native
/// capsule, the tray and the hotkey remain; the next opening rebuilds the WebView.
const IDLE_UNLOAD_SECS: u64 = 120;
/// How long it stays hidden before WebView2 may trim its caches. Trimming on every hide threw
/// away the rasterised page, so the next opening repainted everything while it animated.
const IDLE_TRIM_SECS: u64 = 30;

fn setting(state: &AppState, key: &str) -> Option<String> { state.setting(key) }

/// The windows are opaque cards, so the DWM acrylic behind them stays off unless a setting asks for it.
pub(crate) fn blur_enabled(state: &AppState) -> bool {
    setting(state,"blur").as_deref() == Some("true")
}

pub(crate) fn monitor_for(app: &tauri::AppHandle, state: &AppState) -> Option<tauri::Monitor> {
    let monitors = app.available_monitors().ok()?;
    let choice = setting(state,"monitor").and_then(|s| s.parse::<usize>().ok());
    choice.and_then(|i| monitors.get(i).cloned()).or_else(|| app.primary_monitor().ok().flatten()).or_else(|| monitors.into_iter().next())
}

/// Where the capsule rests: the position it was dragged to, or centred at the top of the chosen monitor.
fn capsule_home(app: &tauri::AppHandle, state: &AppState) -> (PhysicalPosition<i32>, f64) {
    if let (Some(x),Some(y)) = (setting(state,"capsuleX").and_then(|s|s.parse::<i32>().ok()),setting(state,"capsuleY").and_then(|s|s.parse::<i32>().ok())) {
        if let Ok(monitors) = app.available_monitors() {
            if let Some(monitor) = monitors.iter().find(|m| x >= m.position().x && y >= m.position().y && x < m.position().x + m.size().width as i32 && y < m.position().y + m.size().height as i32) {
                return (PhysicalPosition::new(x,y), monitor.scale_factor());
            }
        }
    }
    if let Some(monitor) = monitor_for(app,state) {
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let width = (capsule::WIDTH * scale).round() as i32;
        return (PhysicalPosition::new(area.position.x + (area.size.width as i32 - width)/2, area.position.y + (12.0 * scale) as i32), scale);
    }
    (PhysicalPosition::new(500,12), 1.0)
}

fn saved_size(state: &AppState, mode: &str, fallback: (f64, f64), minimum: (f64, f64), monitor: Option<&tauri::Monitor>) -> (f64, f64) {
    let width = setting(state, &format!("{mode}Width")).and_then(|s| s.parse::<f64>().ok()).unwrap_or(fallback.0);
    let height = setting(state, &format!("{mode}Height")).and_then(|s| s.parse::<f64>().ok()).unwrap_or(fallback.1);
    let maximum = monitor
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
    // window as active to DWM so the editor stays translucent.
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
        use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_TRANSITIONS_FORCEDISABLED, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND};
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
            // The page animates its own entrance; a DWM fade on show and hide would run on top of it.
            let disabled: windows_sys::core::BOOL = 1;
            DwmSetWindowAttribute(hwnd.0,DWMWA_TRANSITIONS_FORCEDISABLED as u32,&disabled as *const _ as _,std::mem::size_of_val(&disabled) as u32);
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

/// Turns the window's DWM backdrop on or off. On Windows 11 22H2 and later window-vibrancy
/// uses the system backdrop (DWMSBT_TRANSIENTWINDOW), the acrylic of Windows' own flyouts.
pub fn apply_window_material(window: &tauri::WebviewWindow, active: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        // The accent blur paints black over WebView2 on this Windows 11 build.
        // DWM acrylic supports composition with the transparent WebView instead.
        if active && windows_transparency_enabled() {
            window_vibrancy::apply_acrylic(window,None).map_err(|e| e.to_string())
        } else {
            window_vibrancy::clear_acrylic(window).map_err(|e| e.to_string())
        }
    }
    #[cfg(not(windows))]
    { let _ = (window, active); Ok(()) }
}

pub fn refresh_window_materials(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    let mode = state.mode.lock().map_err(|e| e.to_string())?.clone();
    if let Some(window) = app.get_webview_window("main") {
        if mode == "quick" || mode == "workspace" { apply_window_material(&window, blur_enabled(state))?; }
    }
    Ok(())
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

pub(crate) fn clamp_position(position: PhysicalPosition<i32>, size: (u32,u32), monitor: &tauri::Monitor) -> PhysicalPosition<i32> {
    let area = monitor.work_area();
    let max_x = (area.position.x + area.size.width as i32 - size.0 as i32).max(area.position.x);
    let max_y = (area.position.y + area.size.height as i32 - size.1 as i32).max(area.position.y);
    PhysicalPosition::new(position.x.clamp(area.position.x,max_x),position.y.clamp(area.position.y,max_y))
}

pub fn reposition_capsule(app: &tauri::AppHandle, state: &AppState) {
    if !capsule::is_visible() { return; }
    let (position, scale) = capsule_home(app, state);
    capsule::show(position.x, position.y, scale);
}

/// Matches the capsule to the app theme and interface scale.
pub fn refresh_capsule_appearance(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let dark = match setting(&state,"theme").as_deref() {
        Some("light") => false,
        Some("system") => !capsule::system_prefers_light(),
        _ => true,
    };
    let scale = setting(&state,"scale").and_then(|s| s.parse::<f64>().ok()).unwrap_or(100.0) / 100.0;
    capsule::set_appearance(dark, scale);
}

pub fn capsule_action(app: &tauri::AppHandle, action: capsule::Action) {
    match action {
        capsule::Action::Toggle => deliver(app, "topnote:request-mode", "toggle"),
        capsule::Action::Favorites => deliver(app, "topnote:navigate", "favorites"),
        capsule::Action::NewNote => deliver(app, "topnote:navigate", "new"),
        capsule::Action::Hovered => prewarm(app),
        capsule::Action::Moved(x, y) => {
            let state = app.state::<AppState>();
            for (key, value) in [("capsuleX", x), ("capsuleY", y)] {
                if let Err(error) = state.set_setting(key, &value.to_string()) { eprintln!("Posição da cápsula: {error}"); }
            }
        }
        capsule::Action::ThemeChanged => refresh_capsule_appearance(app),
    }
}

/// Sends an event to the editor page. While the page is unloaded or still starting, the
/// event waits in a queue that the page drains once it is ready (main_ready).
pub fn deliver(app: &tauri::AppHandle, event: &str, payload: &str) {
    let state = app.state::<AppState>();
    {
        // Checked under the queue lock, so an event never lands after the page drained it.
        let Ok(mut pending) = state.pending.lock() else { return };
        if !state.main_ready.load(Ordering::SeqCst) || app.get_webview_window("main").is_none() {
            pending.push((event.to_string(), payload.to_string()));
            drop(pending);
            prewarm(app);
            return;
        }
    }
    if let Err(error) = app.emit_to("main", event, payload) { eprintln!("Evento {event}: {error}"); }
}

/// Builds the editor window in the background if it does not exist yet.
pub fn prewarm(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    // Being used again: restart the unload countdown.
    let mode = state.mode.lock().map(|mode| mode.clone()).unwrap_or_default();
    if mode == "capsule" || mode == "hidden" { schedule_unload(app); }
    // A hover usually means a click is coming: give the trimmed WebView its caches back first.
    if let Some(window) = app.get_webview_window("main") { set_webview_idle(&window, false); return; }
    if state.building.swap(true, Ordering::SeqCst) { return; }
    let app = app.clone();
    // WebView2 windows are built off the main thread so the event loop can service the build.
    std::thread::spawn(move || {
        if let Err(error) = build_main(&app) { eprintln!("Editor: {error}"); }
        app.state::<AppState>().building.store(false, Ordering::SeqCst);
    });
}

fn build_main(app: &tauri::AppHandle) -> Result<(), String> {
    let config = app.config().app.windows.iter().find(|config| config.label == "main").ok_or("Janela não configurada.")?.clone();
    let window = tauri::WebviewWindowBuilder::from_config(app, &config).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?;
    window.set_shadow(true).map_err(|e| e.to_string())?;
    round_window(&window.as_ref().window())
}

/// Lets the hidden editor trim its caches after a while, and unloads its WebView later still.
fn schedule_unload(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let generation = state.idle.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        let still_idle = |app: &tauri::AppHandle| {
            let state = app.state::<AppState>();
            let mode = state.mode.lock().map(|mode| mode.clone()).unwrap_or_default();
            state.idle.load(Ordering::SeqCst) == generation && (mode == "capsule" || mode == "hidden")
        };
        std::thread::sleep(std::time::Duration::from_secs(IDLE_TRIM_SECS));
        if !still_idle(&app) { return; }
        if let Some(window) = app.get_webview_window("main") {
            if !window.is_visible().unwrap_or(true) { set_webview_idle(&window, true); }
        }
        std::thread::sleep(std::time::Duration::from_secs(IDLE_UNLOAD_SECS - IDLE_TRIM_SECS));
        if !still_idle(&app) { return; }
        let state = app.state::<AppState>();
        if let Some(window) = app.get_webview_window("main") {
            if window.is_visible().unwrap_or(true) { return; }
            state.main_ready.store(false, Ordering::SeqCst);
            if let Err(error) = window.destroy() { eprintln!("Descarregar editor: {error}"); }
        }
    });
}

/// Capsule rect relative to the editor window, in logical pixels: where the panel grows from.
pub fn motion_anchor(app: &tauri::AppHandle) -> Option<[f64; 4]> {
    let window = app.get_webview_window("main")?;
    let position = window.outer_position().ok()?;
    let scale = window.scale_factor().ok()?;
    let capsule = capsule::geometry();
    Some([(capsule.x - position.x) as f64 / scale, (capsule.y - position.y) as f64 / scale, capsule.width as f64 / scale, capsule.height as f64 / scale])
}

/// Shows the editor without activating it. Activating a WebView2 window (SW_SHOW) blocks the
/// main thread for 60-110 ms while focus moves into the page, and the IPC reply waits behind
/// it; showing it inactive takes about 3 ms. The page calls activate_window once its entrance
/// is under way, so the panel starts moving at once and gets focus a moment later.
fn show_inactive(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNA};
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        unsafe { ShowWindow(hwnd.0, SW_SHOWNA); }
        Ok(())
    }
    #[cfg(not(windows))]
    { window.show().map_err(|e| e.to_string())?; window.set_focus().map_err(|e| e.to_string()) }
}

/// Activates the shown editor and keeps Tao's visibility state in step with the window.
pub fn activate_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::IsWindowVisible;
        // Closed again before this ran: leave it hidden.
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        if unsafe { IsWindowVisible(hwnd.0) } == 0 { return Ok(()); }
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

/// Applies a window mode. Windows never animate their bounds: the editor appears at its final
/// size and the page animates its own surface out of the capsule. When `animate` asks for that
/// entrance, the backdrop stays off (the page turns it on when it settles) and the capsule
/// anchor is returned.
pub fn set_window_mode(app: &tauri::AppHandle, mode: &str, animate: bool) -> Result<Option<[f64; 4]>, String> {
    if !["capsule","quick","workspace","hidden"].contains(&mode) { return Err("Modo de janela inválido.".into()); }
    let state = app.state::<AppState>();
    let window = app.get_webview_window("main");
    let previous = state.mode.lock().map_err(|e| e.to_string())?.clone();
    let top_setting = setting(&state,"alwaysOnTop").unwrap_or_else(|| "always".into());
    let mut anchor = None;
    match mode {
        "hidden" | "capsule" => {
            if let Some(window) = &window {
                window.hide().map_err(|e| e.to_string())?;
                // Also hide through Win32: a window shown by show_inactive that was never activated
                // is still hidden as far as Tao knows, so its hide would do nothing.
                #[cfg(windows)]
                if let Ok(hwnd) = window.hwnd() { unsafe { windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(hwnd.0, windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE); } }
            }
            if mode == "hidden" { capsule::hide(); }
            else {
                let (position, scale) = if capsule::is_visible() { let g = capsule::geometry(); (PhysicalPosition::new(g.x, g.y), g.scale) } else { capsule_home(app, &state) };
                capsule::show(position.x, position.y, scale);
                capsule::set_expanded(false);
                capsule::set_topmost(top_setting == "always");
            }
        }
        "quick" => {
            let window = window.as_ref().ok_or("Janela principal não encontrada.")?;
            let (base, capsule_scale) = if capsule::is_visible() && (previous == "quick" || previous == "capsule") {
                let g = capsule::geometry(); (PhysicalPosition::new(g.x, g.y), g.scale)
            } else { capsule_home(app, &state) };
            capsule::show(base.x, base.y, capsule_scale);
            capsule::set_expanded(true);
            capsule::set_topmost(top_setting != "never");
            let monitor = app.monitor_from_point(base.x as f64, base.y as f64).ok().flatten().or_else(|| monitor_for(app, &state));
            let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(capsule_scale);
            let (width,height) = saved_size(&state,"quickPanel",(660.0,638.0),(420.0,340.0),monitor.as_ref());
            window.set_min_size(Some(LogicalSize::new(420.0,340.0))).map_err(|e| e.to_string())?;
            window.set_resizable(true).map_err(|e| e.to_string())?;
            if previous != mode {
                let size = ((width*scale).round() as u32,(height*scale).round() as u32);
                let mut target = PhysicalPosition::new(base.x - (((width-capsule::WIDTH)/2.0)*scale) as i32,base.y + (64.0*scale) as i32);
                if let Some(monitor) = &monitor { target = clamp_position(target,size,monitor); }
                window.set_size(tauri::PhysicalSize::new(size.0,size.1)).map_err(|e| e.to_string())?;
                window.set_position(target).map_err(|e| e.to_string())?;
                if animate && previous != "workspace" {
                    anchor = Some([(base.x - target.x) as f64 / scale, (base.y - target.y) as f64 / scale, capsule::WIDTH * capsule_scale / scale, capsule::HEIGHT * capsule_scale / scale]);
                }
            }
            window.set_skip_taskbar(true).map_err(|e| e.to_string())?;
            window.set_always_on_top(top_setting != "never").map_err(|e| e.to_string())?;
            apply_window_material(window, anchor.is_none() && blur_enabled(&state))?;
            set_webview_idle(window, false);
            show_inactive(window)?;
        }
        "workspace" => {
            let window = window.as_ref().ok_or("Janela principal não encontrada.")?;
            capsule::hide();
            window.set_always_on_top(top_setting == "always").map_err(|e| e.to_string())?;
            window.set_skip_taskbar(false).map_err(|e| e.to_string())?;
            window.set_resizable(true).map_err(|e| e.to_string())?;
            let monitor = window.current_monitor().ok().flatten().or_else(|| monitor_for(app, &state));
            let (width,height) = monitor.as_ref().map(|m| ((m.size().width as f64 / m.scale_factor()).min(1280.0).max(800.0),(m.size().height as f64 / m.scale_factor()).min(820.0).max(550.0))).unwrap_or((1200.0,760.0));
            let (width,height) = saved_size(&state,"workspace",(width,height),(780.0,520.0),monitor.as_ref());
            window.set_min_size(Some(LogicalSize::new(780.0,520.0))).map_err(|e| e.to_string())?;
            if previous != mode {
                window.set_size(LogicalSize::new(width,height)).map_err(|e| e.to_string())?;
                window.center().map_err(|e| e.to_string())?;
            }
            apply_window_material(window, blur_enabled(&state))?;
            set_webview_idle(window, false);
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
        _ => unreachable!(),
    }
    *state.mode.lock().map_err(|e| e.to_string())? = mode.into();
    let _ = app.emit("topnote:mode",mode);
    if mode == "capsule" || mode == "hidden" { schedule_unload(app); }
    else { state.idle.fetch_add(1, Ordering::SeqCst); }
    Ok(anchor)
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
