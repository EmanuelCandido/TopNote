mod attachments;
mod backup;
mod capsule;
mod commands;
mod db;
mod native;
mod repository;

use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, RwLock};
use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Manager, RunEvent};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

pub struct AppState {
    root: PathBuf,
    db_path: PathBuf,
    /// One SQLite connection for the whole app, opened at start; commands take turns on it
    /// instead of opening the file and setting its pragmas on every call.
    db: Mutex<Connection>,
    mode: Mutex<String>,
    hotkey: Mutex<String>,
    /// Every setting, read once from SQLite; window code reads these on each mode change.
    settings: RwLock<HashMap<String, String>>,
    /// Events for the editor page that arrived while it was unloaded or still starting.
    pub(crate) pending: Mutex<Vec<(String, String)>>,
    /// The editor page has registered its listeners and drained `pending`.
    pub(crate) main_ready: AtomicBool,
    pub(crate) building: AtomicBool,
    /// Bumped by every mode change; an unload countdown only fires if it still matches.
    pub(crate) idle: AtomicU64,
}

impl AppState {
    fn new(root: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(root.join("attachments")).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(root.join("backups")).map_err(|e| e.to_string())?;
        let db_path = root.join("topnote.db");
        let db = Mutex::new(db::connect(&db_path).map_err(|e| e.to_string())?);
        let state = Self {root,db_path,db,mode:Mutex::new("capsule".into()),hotkey:Mutex::new("Ctrl+Shift+Space".into()),settings:RwLock::new(HashMap::new()),pending:Mutex::new(Vec::new()),main_ready:AtomicBool::new(false),building:AtomicBool::new(false),idle:AtomicU64::new(0)};
        attachments::cleanup_old_drag_files(&state);
        {
            let mut conn = state.connection()?;
            db::migrate(&mut conn).map_err(|e| e.to_string())?;
            if let Err(error) = backup::auto_backup(&conn,&state) { eprintln!("Backup automático: {error}"); }
        }
        state.reload_settings()?;
        Ok(state)
    }
    /// The shared connection. Hold the guard only for the work at hand: anything else that needs
    /// the database (settings included) waits for it, so never call back into `self` while holding it.
    fn connection(&self) -> Result<MutexGuard<'_, Connection>, String> { Ok(self.db.lock().unwrap_or_else(|e| e.into_inner())) }
    fn safe_attachment_path(&self, relative: &str) -> Result<PathBuf, String> {
        let path = Path::new(relative);
        let parts: Vec<_> = path.components().collect();
        if parts.len() < 3 || parts.first() != Some(&Component::Normal("attachments".as_ref())) || parts.iter().any(|c| !matches!(c,Component::Normal(_))) { return Err("Caminho de anexo inválido.".into()); }
        Ok(self.root.join(path))
    }
    pub(crate) fn setting(&self, key: &str) -> Option<String> {
        self.settings.read().ok()?.get(key).cloned()
    }
    pub(crate) fn settings_snapshot(&self) -> HashMap<String, String> {
        self.settings.read().map(|settings| settings.clone()).unwrap_or_default()
    }
    pub(crate) fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        self.connection()?.execute("INSERT INTO settings(key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,value]).map_err(|e| e.to_string())?;
        self.settings.write().map_err(|e| e.to_string())?.insert(key.into(), value.into());
        Ok(())
    }
    pub(crate) fn remove_settings(&self, keys: &[&str]) -> Result<(), String> {
        let conn = self.connection()?;
        let mut settings = self.settings.write().map_err(|e| e.to_string())?;
        for key in keys {
            conn.execute("DELETE FROM settings WHERE key=?1", [key]).map_err(|e| e.to_string())?;
            settings.remove(*key);
        }
        Ok(())
    }
    /// Reloads the cache after something wrote the settings table directly (backups, restores).
    pub(crate) fn reload_settings(&self) -> Result<(), String> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare("SELECT key,value FROM settings").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?,r.get(1)?))).map_err(|e| e.to_string())?;
        let loaded = rows.collect::<rusqlite::Result<HashMap<String,String>>>().map_err(|e| e.to_string())?;
        *self.settings.write().map_err(|e| e.to_string())? = loaded;
        Ok(())
    }
}

fn menu_action(app: &tauri::AppHandle, action: &str) {
    match action {
        "open" => native::deliver(app,"topnote:request-mode","quick"),
        "new" => native::deliver(app,"topnote:navigate","new"),
        "workspace" => native::deliver(app,"topnote:request-mode","workspace"),
        "hide" => native::deliver(app,"topnote:request-mode","hidden"),
        "settings" => native::deliver(app,"topnote:navigate","settings"),
        "quit" => {
            // With the editor unloaded there is no unsaved text to flush.
            if app.get_webview_window("main").is_some() && app.state::<AppState>().main_ready.load(Ordering::SeqCst) { native::deliver(app,"topnote:quit-requested",""); }
            else { app.exit(0); }
        }
        _ => {}
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,_,_| native::deliver(app,"topnote:request-mode","quick")))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent,None))
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app,shortcut,event| {
            if event.state() == ShortcutState::Pressed {
                if Shortcut::from_str("Ctrl+K").map(|search| shortcut == &search).unwrap_or(false) {
                    native::deliver(app,"topnote:navigate","search");
                    return;
                }
                native::deliver(app,"topnote:request-mode","toggle");
            }
        }).build())
        .setup(|app| {
            let root = app.path().app_local_data_dir()?;
            let state = AppState::new(root).map_err(std::io::Error::other)?;
            app.manage(state);
            capsule::create(app.handle(), native::capsule_action).map_err(std::io::Error::other)?;
            native::refresh_capsule_appearance(app.handle());
            native::initialize_hotkey(app.handle(),&app.state::<AppState>());
            let backup_app = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(3600));
                let state = backup_app.state::<AppState>();
                if let Ok(conn) = state.connection() {
                    if let Err(error) = backup::auto_backup(&conn,&state) { eprintln!("Backup automático: {error}"); }
                }
                let _ = state.reload_settings();
            });
            let items = [
                MenuItem::with_id(app,"open","Abrir TopNote",true,None::<&str>)?,
                MenuItem::with_id(app,"new","Nova nota",true,None::<&str>)?,
                MenuItem::with_id(app,"workspace","Workspace",true,None::<&str>)?,
                MenuItem::with_id(app,"hide","Ocultar cápsula",true,None::<&str>)?,
                MenuItem::with_id(app,"settings","Configurações",true,None::<&str>)?,
                MenuItem::with_id(app,"quit","Sair",true,None::<&str>)?,
            ];
            let menu = Menu::with_items(app,&items.iter().map(|i|i as &dyn tauri::menu::IsMenuItem<_>).collect::<Vec<_>>())?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().ok_or(std::io::Error::other("Ícone não encontrado"))?.clone())
                .tooltip("TopNote")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app,event| menu_action(app,event.id.as_ref()))
                .on_tray_icon_event(|tray,event| {
                    if let TrayIconEvent::Click { button:MouseButton::Left,button_state:MouseButtonState::Up,.. } = event { menu_action(tray.app_handle(),"open"); }
                })
                .build(app)?;
            let state = app.state::<AppState>();
            if state.setting("onboardingDone").is_none() { native::deliver(app.handle(),"topnote:request-mode","quick"); }
            else {
                let show = state.setting("showCapsuleAtStart").unwrap_or_else(||"true".into());
                native::set_window_mode(app.handle(),if show == "false" {"hidden"} else {"capsule"},false).map_err(std::io::Error::other)?;
                // Load the editor now so the first opening is instant; it unloads again if unused.
                native::prewarm(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window,event| {
            match event {
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. } => {
                    if let Err(error) = native::round_window(window) { eprintln!("Cantos da janela: {error}"); }
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    native::deliver(window.app_handle(),"topnote:close-requested","");
                }
                tauri::WindowEvent::Destroyed if window.label() == "main" => {
                    window.state::<AppState>().main_ready.store(false, Ordering::SeqCst);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,commands::upsert_project,commands::set_project_state,commands::reorder_projects,
            commands::list_folders,commands::upsert_folder,commands::set_folder_state,commands::reorder_folders,
            commands::new_note,commands::get_note,commands::save_note,commands::list_notes,commands::search_notes,
            commands::set_note_state,commands::empty_trash,commands::get_tags,commands::set_tags,
            commands::list_versions,commands::restore_version,commands::list_attachments,commands::import_attachment,
            commands::import_attachment_path,commands::delete_attachment,commands::open_attachment,commands::reveal_attachment,commands::start_attachment_drag,commands::get_settings,commands::set_setting,
            commands::data_directory,commands::create_backup,commands::auto_backup_if_due,commands::export_project,commands::restore_backup,commands::export_note_file,
            commands::import_text_note,commands::set_window_mode,commands::activate_window,commands::get_window_mode,commands::motion_anchor,commands::main_ready,commands::is_app_focused,commands::quit_app,commands::report_error
        ])
        .build(tauri::generate_context!())
        .expect("TopNote não pôde iniciar");
    app.run(|_, event| {
        // The editor window is unloaded while idle; the app lives on in the capsule and tray.
        if let RunEvent::ExitRequested { code: None, api, .. } = event { api.prevent_exit(); }
    });
}
