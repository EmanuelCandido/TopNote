use crate::{attachments, backup, native, repository as repo, AppState};
use std::collections::HashMap;
use std::fs;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> Result<Vec<repo::Project>, String> {
    repo::list_projects(&*state.connection()?).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn upsert_project(state: State<'_, AppState>, input: repo::ProjectInput) -> Result<repo::Project, String> {
    repo::upsert_project(&*state.connection()?, input)
}
#[tauri::command]
pub fn set_project_state(state: State<'_, AppState>, id: String, action: String) -> Result<(), String> {
    repo::set_project_state(&*state.connection()?, &id, &action)
}
#[tauri::command]
pub fn reorder_projects(state: State<'_, AppState>, ids: Vec<String>) -> Result<(), String> {
    repo::reorder_projects(&mut *state.connection()?, &ids)
}
#[tauri::command]
pub fn list_folders(state: State<'_, AppState>) -> Result<Vec<repo::Folder>, String> {
    repo::list_folders(&*state.connection()?).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn upsert_folder(state: State<'_, AppState>, input: repo::FolderInput) -> Result<repo::Folder, String> {
    repo::upsert_folder(&*state.connection()?, input)
}
#[tauri::command]
pub fn set_folder_state(state: State<'_, AppState>, id: String, deleted: bool) -> Result<(), String> {
    repo::set_folder_state(&*state.connection()?, &id, deleted)
}
#[tauri::command]
pub fn reorder_folders(state: State<'_, AppState>, ids: Vec<String>) -> Result<(), String> {
    repo::reorder_folders(&mut *state.connection()?, &ids)
}
#[tauri::command]
pub fn new_note(state: State<'_, AppState>, project_id: Option<String>, folder_id: Option<String>) -> Result<repo::Note, String> {
    repo::new_note(&*state.connection()?, project_id.as_deref(), folder_id.as_deref())
}
#[tauri::command]
pub fn get_note(state: State<'_, AppState>, id: String) -> Result<repo::Note, String> {
    let conn = state.connection()?;
    let note = repo::get_note(&conn, &id).map_err(|e| e.to_string())?.ok_or_else(|| "Nota não encontrada.".to_string())?;
    repo::touch_note(&conn, &id).map_err(|e| e.to_string())?;
    Ok(note)
}
#[tauri::command]
pub fn save_note(state: State<'_, AppState>, patch: repo::NotePatch) -> Result<repo::Note, String> {
    repo::save_note(&mut *state.connection()?, patch)
}
#[tauri::command]
pub fn list_notes(state: State<'_, AppState>, view: String, target_id: Option<String>, offset: i64) -> Result<Vec<repo::NoteSummary>, String> {
    repo::list_notes(&*state.connection()?, &view, target_id.as_deref(), offset)
}
#[tauri::command]
pub fn search_notes(state: State<'_, AppState>, query: String) -> Result<Vec<repo::NoteSummary>, String> {
    repo::search_notes(&*state.connection()?, &query)
}
#[tauri::command]
pub fn set_note_state(state: State<'_, AppState>, id: String, action: String) -> Result<(), String> {
    let conn = state.connection()?;
    if action == "permanent" { attachments::remove_note_files(&conn, &state, &id)?; }
    repo::set_note_state(&conn, &id, &action)
}
#[tauri::command]
pub fn empty_trash(state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.connection()?;
    let ids: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM notes WHERE is_deleted=1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>().map_err(|e| e.to_string())?
    };
    for id in &ids { attachments::remove_note_files(&conn, &state, id)?; }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM notes WHERE is_deleted=1", []).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn get_tags(state: State<'_, AppState>, note_id: String) -> Result<Vec<String>, String> {
    repo::get_tags(&*state.connection()?, &note_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn set_tags(state: State<'_, AppState>, note_id: String, names: Vec<String>) -> Result<(), String> {
    repo::set_tags(&mut *state.connection()?, &note_id, names)
}
#[tauri::command]
pub fn list_versions(state: State<'_, AppState>, note_id: String) -> Result<Vec<repo::Version>, String> {
    repo::list_versions(&*state.connection()?, &note_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn restore_version(state: State<'_, AppState>, version_id: String) -> Result<repo::Note, String> {
    repo::restore_version(&mut *state.connection()?, &version_id)
}
#[tauri::command]
pub fn list_attachments(state: State<'_, AppState>, note_id: String) -> Result<Vec<attachments::Attachment>, String> {
    attachments::list(&*state.connection()?, &state, &note_id)
}
#[tauri::command]
pub fn import_attachment(state: State<'_, AppState>, note_id: String, filename: String, data: Vec<u8>) -> Result<attachments::Attachment, String> {
    attachments::import_bytes(&*state.connection()?, &state, &note_id, &filename, &data)
}
#[tauri::command]
pub fn import_attachment_path(state: State<'_, AppState>, note_id: String, path: String) -> Result<attachments::Attachment, String> {
    attachments::import_path(&*state.connection()?, &state, &note_id, &path)
}
#[tauri::command]
pub fn delete_attachment(state: State<'_, AppState>, id: String) -> Result<(), String> {
    attachments::delete(&*state.connection()?, &state, &id)
}
#[tauri::command]
pub fn open_attachment(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let path = attachments::file_path(&*state.connection()?, &state, &id)?;
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn reveal_attachment(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let path = attachments::file_path(&*state.connection()?, &state, &id)?;
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|error| error.to_string())
}
#[cfg(windows)]
#[tauri::command]
pub async fn start_attachment_drag(app: AppHandle, window: tauri::Window, state: State<'_, AppState>, id: String) -> Result<(), String> {
    let staged = attachments::stage_drag_file(&*state.connection()?, &state, &id)?;
    let drag_path = staged.clone();
    let (sender, receiver) = std::sync::mpsc::channel();
    if let Err(error) = app.run_on_main_thread(move || {
        let result = drag::start_drag(
            &window,
            drag::DragItem::Files(vec![drag_path]),
            drag::Image::Raw(include_bytes!("../icons/32x32.png").to_vec()),
            |_, _| {},
            drag::Options::default(),
        ).map_err(|error| error.to_string());
        let _ = sender.send(result);
    }) {
        attachments::remove_staged_drag_file(&staged);
        return Err(error.to_string());
    }
    let result = match receiver.recv() {
        Ok(result) => result,
        Err(error) => {
            attachments::remove_staged_drag_file(&staged);
            return Err(error.to_string());
        }
    };
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(120));
        attachments::remove_staged_drag_file(&staged);
    });
    result
}

#[cfg(not(windows))]
#[tauri::command]
pub fn start_attachment_drag() -> Result<(), String> {
    Err("Arrastar anexos para fora do aplicativo está disponível no Windows.".into())
}
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> HashMap<String, String> { state.settings_snapshot() }
#[tauri::command]
pub fn set_setting(app: AppHandle, state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    const KEYS: &[&str] = &["theme","transparency","blur","scale","animations","trayOnClose","autoHide","alwaysOnTop","monitor","hotkey","showCapsuleAtStart","openMinimized","backupAuto","backupInterval","backupMax","onboardingDone","capsuleX","capsuleY","quickPanelWidth","quickPanelHeight","workspaceWidth","workspaceHeight","lastBackupAt","lastNoteId"];
    if !KEYS.contains(&key.as_str()) || value.len() > 200 { return Err("Configuração inválida.".into()); }
    if key == "blur" && value != "true" && value != "false" { return Err("Valor de desfoque inválido.".into()); }
    if key == "hotkey" { native::change_hotkey(&app, &state, &value)?; }
    state.set_setting(&key, &value)?;
    if ["theme","transparency","blur","scale","animations"].contains(&key.as_str()) {
        app.emit("topnote:appearance",()).map_err(|e| e.to_string())?;
    }
    if key == "theme" || key == "scale" { native::refresh_capsule_appearance(&app); }
    if key == "blur" { native::refresh_window_materials(&app,&state)?; }
    if key == "monitor" {
        state.remove_settings(&["capsuleX","capsuleY"])?;
        native::reposition_capsule(&app,&state);
    }
    Ok(())
}
#[tauri::command]
pub fn data_directory(state: State<'_, AppState>) -> String { state.root.to_string_lossy().into_owned() }
#[tauri::command]
pub fn create_backup(state: State<'_, AppState>, destination: Option<String>) -> Result<String, String> {
    backup::create_backup(&*state.connection()?, &state, destination.as_deref())
}
#[tauri::command]
pub fn auto_backup_if_due(state: State<'_, AppState>) -> Result<(), String> {
    backup::auto_backup(&*state.connection()?, &state)?;
    state.reload_settings()
}
#[tauri::command]
pub fn export_project(state: State<'_, AppState>, project_id: String, destination: String) -> Result<(), String> {
    backup::export_project(&*state.connection()?, &state, &project_id, &destination)
}
#[tauri::command]
pub fn restore_backup(app: AppHandle, state: State<'_, AppState>, source: String) -> Result<(), String> {
    backup::restore_backup(&state, &source)?;
    state.reload_settings()?;
    native::refresh_capsule_appearance(&app);
    Ok(())
}
#[tauri::command]
pub fn export_note_file(path: String, content: String) -> Result<(), String> {
    if content.len() > 20_000_000 { return Err("Arquivo de exportação muito grande.".into()); }
    fs::write(path, content).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn import_text_note(state: State<'_, AppState>, path: String, project_id: Option<String>) -> Result<repo::Note, String> {
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if text.len() > 5_000_000 { return Err("Arquivo excede 5 MB.".into()); }
    let extension = std::path::Path::new(&path).extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
    if extension != "txt" && extension != "md" { return Err("Importe um arquivo TXT ou Markdown.".into()); }
    let title = std::path::Path::new(&path).file_stem().and_then(|s| s.to_str()).unwrap_or("Nota importada").to_string();
    let paragraphs: Vec<serde_json::Value> = text.lines().map(|line| serde_json::json!({"type":"paragraph","content":[{"type":"text","text":line}]})).collect();
    let content_json = serde_json::json!({"type":"doc","content":paragraphs}).to_string();
    let mut conn = state.connection()?;
    let note = repo::new_note(&conn, project_id.as_deref(), None)?;
    repo::save_note(&mut conn, repo::NotePatch { id:note.id,title,content_json,content_text:text,project_id,folder_id:None })
}
#[tauri::command]
pub fn set_window_mode(app: AppHandle, mode: String, animate: Option<bool>) -> Result<Option<[f64; 4]>, String> { native::set_window_mode(&app, &mode, animate.unwrap_or(false)) }
#[tauri::command]
pub fn get_window_mode(state: State<'_, AppState>) -> Result<String, String> { state.mode.lock().map(|mode| mode.clone()).map_err(|e| e.to_string()) }
/// Gives the quick panel focus once its entrance has started (see native::show_inactive).
#[tauri::command]
pub fn activate_window(window: tauri::WebviewWindow) -> Result<(), String> { native::activate_window(&window) }
#[tauri::command]
pub fn motion_anchor(app: AppHandle) -> Option<[f64; 4]> { native::motion_anchor(&app) }
#[derive(serde::Serialize)]
pub struct PendingEvent { event: String, payload: String }
/// Called by the editor page once its listeners are registered: from now on events are
/// emitted directly, and the ones that queued up while it loaded are handed over.
#[tauri::command]
pub fn main_ready(state: State<'_, AppState>) -> Result<Vec<PendingEvent>, String> {
    let mut pending = state.pending.lock().map_err(|e| e.to_string())?;
    state.main_ready.store(true, Ordering::SeqCst);
    Ok(pending.drain(..).map(|(event, payload)| PendingEvent { event, payload }).collect())
}
#[tauri::command]
pub fn is_app_focused(app: AppHandle) -> bool {
    app.webview_windows().values().any(|window| window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false))
}
#[tauri::command]
pub fn quit_app(app: AppHandle) { app.exit(0); }
#[tauri::command]
pub fn report_error(state: State<'_, AppState>, message: String) -> Result<(), String> {
    use std::io::Write;
    let path = state.root.join("topnote.log");
    let mut file = fs::OpenOptions::new().create(true).append(true).open(path).map_err(|e| e.to_string())?;
    let clean: String = message.chars().filter(|c| !c.is_control()).take(1000).collect();
    writeln!(file,"{} {}",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_secs()).unwrap_or(0),clean).map_err(|e|e.to_string())
}
