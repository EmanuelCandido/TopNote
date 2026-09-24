mod attachments;
mod backup;
mod commands;
mod db;
mod native;
mod repository;

use rusqlite::Connection;
use std::path::{Component, Path, PathBuf};
use std::str::FromStr;
use std::sync::Mutex;
use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Emitter, Manager};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogRequest {
    pub(crate) request_id: String,
    pub(crate) kind: String,
    pub(crate) id: Option<String>,
    pub(crate) project_id: Option<String>,
}

pub struct AppState {
    root: PathBuf,
    db_path: PathBuf,
    mode: Mutex<String>,
    hotkey: Mutex<String>,
    pub(crate) dialog: Mutex<Option<DialogRequest>>,
}

impl AppState {
    fn new(root: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(root.join("attachments")).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(root.join("backups")).map_err(|e| e.to_string())?;
        let db_path = root.join("topnote.db");
        let state = Self {root,db_path,mode:Mutex::new("capsule".into()),hotkey:Mutex::new("Ctrl+Shift+Space".into()),dialog:Mutex::new(None)};
        attachments::cleanup_old_drag_files(&state);
        let mut conn = state.connection()?;
        db::migrate(&mut conn).map_err(|e| e.to_string())?;
        if let Err(error) = backup::auto_backup(&conn,&state) { eprintln!("Backup automático: {error}"); }
        Ok(state)
    }
    fn connection(&self) -> Result<Connection, String> { db::connect(&self.db_path).map_err(|e| e.to_string()) }
    fn safe_attachment_path(&self, relative: &str) -> Result<PathBuf, String> {
        let path = Path::new(relative);
        let parts: Vec<_> = path.components().collect();
        if parts.len() < 3 || parts.first() != Some(&Component::Normal("attachments".as_ref())) || parts.iter().any(|c| !matches!(c,Component::Normal(_))) { return Err("Caminho de anexo inválido.".into()); }
        Ok(self.root.join(path))
    }
}

fn menu_action(app: &tauri::AppHandle, action: &str) {
    match action {
        "open" => { let _ = app.emit_to("main","topnote:request-mode","quick"); }
        "new" => { let _ = app.emit("topnote:navigate","new"); }
        "workspace" => { let _ = app.emit_to("main","topnote:request-mode","workspace"); }
        "hide" => { let _ = app.emit_to("main","topnote:request-mode","hidden"); }
        "settings" => { let _ = app.emit_to("main","topnote:navigate","settings"); }
        "quit" => { let _ = app.emit("topnote:quit-requested",()); }
        _ => {}
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,_,_| { let _ = app.emit_to("main","topnote:request-mode","quick"); }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent,None))
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app,shortcut,event| {
            if event.state() == ShortcutState::Pressed {
                if Shortcut::from_str("Ctrl+K").map(|search| shortcut == &search).unwrap_or(false) {
                    let _ = app.emit_to("main","topnote:navigate","search");
                    return;
                }
                let _ = app.emit_to("main","topnote:request-mode","toggle");
            }
        }).build())
        .setup(|app| {
            let root = app.path().app_local_data_dir()?;
            let state = AppState::new(root).map_err(std::io::Error::other)?;
            app.manage(state);
            for config in &app.config().app.windows {
                tauri::WebviewWindowBuilder::from_config(app,config)?.build()?;
            }
            native::initialize_windows(app.handle()).map_err(std::io::Error::other)?;
            native::initialize_hotkey(app.handle(),&app.state::<AppState>());
            let backup_app = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(3600));
                let state = backup_app.state::<AppState>();
                if let Ok(conn) = state.connection() {
                    if let Err(error) = backup::auto_backup(&conn,&state) { eprintln!("Backup automático: {error}"); }
                }
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
            let first_run = app.state::<AppState>().connection()?.query_row("SELECT value FROM settings WHERE key='onboardingDone'",[],|r|r.get::<_,String>(0)).is_err();
            if first_run { native::set_window_mode(app.handle(),"quick").map_err(std::io::Error::other)?; }
            else {
                let show = app.state::<AppState>().connection()?.query_row("SELECT value FROM settings WHERE key='showCapsuleAtStart'",[],|r|r.get::<_,String>(0)).unwrap_or_else(|_|"true".into());
                native::set_window_mode(app.handle(),if show == "false" {"hidden"} else {"capsule"}).map_err(std::io::Error::other)?;
            }
            Ok(())
        })
        .on_window_event(|window,event| {
            if let tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. } = event {
                if let Err(error) = native::round_window(window) { eprintln!("Cantos da janela: {error}"); }
            }
            if let tauri::WindowEvent::CloseRequested {api,..} = event {
                api.prevent_close();
                if window.label() == "dialog" {
                    let _ = window.hide();
                    if let Ok(mut request) = window.state::<AppState>().dialog.lock() { *request = None; }
                    let _ = window.emit("topnote:dialog-closed",());
                } else if window.label() == "projects" {
                    let _ = native::hide_projects(window.app_handle());
                } else {
                    let _ = window.app_handle().emit("topnote:close-requested",());
                }
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
            commands::import_text_note,commands::set_window_mode,commands::get_window_mode,commands::set_capsule_active,commands::show_dialog,commands::get_dialog_request,commands::hide_dialog,commands::show_projects,commands::hide_projects,commands::is_app_focused,commands::quit_app,commands::report_error
        ])
        .run(tauri::generate_context!())
        .expect("TopNote não pôde iniciar");
}
