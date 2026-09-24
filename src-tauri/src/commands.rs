use crate::{attachments, backup, native, repository as repo, AppState, DialogRequest};
use rusqlite::params;
use std::collections::HashMap;
use std::fs;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, State};

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> Result<Vec<repo::Project>, String> {
    repo::list_projects(&state.connection()?).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn upsert_project(state: State<'_, AppState>, input: repo::ProjectInput) -> Result<repo::Project, String> {
    repo::upsert_project(&state.connection()?, input)
}
#[tauri::command]
pub fn set_project_state(state: State<'_, AppState>, id: String, action: String) -> Result<(), String> {
    repo::set_project_state(&state.connection()?, &id, &action)
}
#[tauri::command]
pub fn reorder_projects(state: State<'_, AppState>, ids: Vec<String>) -> Result<(), String> {
    repo::reorder_projects(&mut state.connection()?, &ids)
}
#[tauri::command]
pub fn list_folders(state: State<'_, AppState>) -> Result<Vec<repo::Folder>, String> {
    repo::list_folders(&state.connection()?).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn upsert_folder(state: State<'_, AppState>, input: repo::FolderInput) -> Result<repo::Folder, String> {
    repo::upsert_folder(&state.connection()?, input)
}
#[tauri::command]
pub fn set_folder_state(state: State<'_, AppState>, id: String, deleted: bool) -> Result<(), String> {
    repo::set_folder_state(&state.connection()?, &id, deleted)
}
#[tauri::command]
pub fn reorder_folders(state: State<'_, AppState>, ids: Vec<String>) -> Result<(), String> {
    repo::reorder_folders(&mut state.connection()?, &ids)
}
#[tauri::command]
pub fn new_note(state: State<'_, AppState>, project_id: Option<String>, folder_id: Option<String>) -> Result<repo::Note, String> {
    repo::new_note(&state.connection()?, project_id.as_deref(), folder_id.as_deref())
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
    repo::save_note(&mut state.connection()?, patch)
}
#[tauri::command]
pub fn list_notes(state: State<'_, AppState>, view: String, target_id: Option<String>, offset: i64) -> Result<Vec<repo::NoteSummary>, String> {
    repo::list_notes(&state.connection()?, &view, target_id.as_deref(), offset)
}
#[tauri::command]
pub fn search_notes(state: State<'_, AppState>, query: String) -> Result<Vec<repo::NoteSummary>, String> {
    repo::search_notes(&state.connection()?, &query)
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
    repo::get_tags(&state.connection()?, &note_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn set_tags(state: State<'_, AppState>, note_id: String, names: Vec<String>) -> Result<(), String> {
    repo::set_tags(&mut state.connection()?, &note_id, names)
}
#[tauri::command]
pub fn list_versions(state: State<'_, AppState>, note_id: String) -> Result<Vec<repo::Version>, String> {
    repo::list_versions(&state.connection()?, &note_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn restore_version(state: State<'_, AppState>, version_id: String) -> Result<repo::Note, String> {
    repo::restore_version(&mut state.connection()?, &version_id)
}
#[tauri::command]
pub fn list_attachments(state: State<'_, AppState>, note_id: String) -> Result<Vec<attachments::Attachment>, String> {
    attachments::list(&state.connection()?, &state, &note_id)
}
#[tauri::command]
pub fn import_attachment(state: State<'_, AppState>, note_id: String, filename: String, data: Vec<u8>) -> Result<attachments::Attachment, String> {
    attachments::import_bytes(&state.connection()?, &state, &note_id, &filename, &data)
}
#[tauri::command]
pub fn import_attachment_path(state: State<'_, AppState>, note_id: String, path: String) -> Result<attachments::Attachment, String> {
    attachments::import_path(&state.connection()?, &state, &note_id, &path)
}
#[tauri::command]
pub fn delete_attachment(state: State<'_, AppState>, id: String) -> Result<(), String> {
    attachments::delete(&state.connection()?, &state, &id)
}
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    let conn = state.connection()?;
    let mut stmt = conn.prepare("SELECT key,value FROM settings").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?,r.get(1)?))).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<_>>().map_err(|e| e.to_string())
}
#[tauri::command]
pub fn set_setting(app: AppHandle, state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    const KEYS: &[&str] = &["theme","transparency","blur","scale","animations","trayOnClose","autoHide","alwaysOnTop","monitor","hotkey","showCapsuleAtStart","openMinimized","backupAuto","backupInterval","backupMax","onboardingDone","capsuleX","capsuleY","quickPanelWidth","quickPanelHeight","workspaceWidth","workspaceHeight","lastBackupAt","lastNoteId"];
    if !KEYS.contains(&key.as_str()) || value.len() > 200 { return Err("Configuração inválida.".into()); }
    if key == "blur" && value != "true" && value != "false" { return Err("Valor de desfoque inválido.".into()); }
    if key == "hotkey" { native::change_hotkey(&app, &state, &value)?; }
    state.connection()?.execute("INSERT INTO settings(key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,value]).map_err(|e| e.to_string())?;
    if ["theme","transparency","blur","scale","animations"].contains(&key.as_str()) {
        app.emit("topnote:appearance",()).map_err(|e| e.to_string())?;
    }
    #[cfg(windows)]
    if key == "blur" { native::refresh_window_materials(&app,&state)?; }
    if key == "monitor" {
        state.connection()?.execute("DELETE FROM settings WHERE key IN ('capsuleX','capsuleY')",[]).map_err(|e| e.to_string())?;
        native::reposition_capsule(&app,&state)?;
    }
    Ok(())
}
#[tauri::command]
pub fn data_directory(state: State<'_, AppState>) -> String { state.root.to_string_lossy().into_owned() }
#[tauri::command]
pub fn create_backup(state: State<'_, AppState>, destination: Option<String>) -> Result<String, String> {
    backup::create_backup(&state.connection()?, &state, destination.as_deref())
}
#[tauri::command]
pub fn auto_backup_if_due(state: State<'_, AppState>) -> Result<(), String> {
    backup::auto_backup(&state.connection()?, &state)
}
#[tauri::command]
pub fn export_project(state: State<'_, AppState>, project_id: String, destination: String) -> Result<(), String> {
    backup::export_project(&state.connection()?, &state, &project_id, &destination)
}
#[tauri::command]
pub fn restore_backup(state: State<'_, AppState>, source: String) -> Result<(), String> {
    backup::restore_backup(&state, &source)
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
pub fn set_window_mode(app: AppHandle, mode: String) -> Result<(), String> { native::set_window_mode(&app, &mode) }
#[tauri::command]
pub fn get_window_mode(state: State<'_, AppState>) -> Result<String, String> { state.mode.lock().map(|mode| mode.clone()).map_err(|e| e.to_string()) }
#[tauri::command]
pub fn set_capsule_active(window: tauri::WebviewWindow, state: State<'_, AppState>, active: bool) -> Result<(), String> {
    if window.label() != "capsule" { return Err("Ação disponível apenas na cápsula.".into()); }
    #[cfg(windows)]
    {
        native::apply_window_material(&window,active && native::blur_enabled(&state))?;
    }
    Ok(())
}
#[tauri::command]
pub fn show_dialog(app: AppHandle, state: State<'_, AppState>, kind: String, id: Option<String>, project_id: Option<String>) -> Result<(), String> {
    let (width, height) = match kind.as_str() {
        "project" => (540.0_f64, 700.0_f64),
        "folder" if project_id.is_some() => (460.0, 330.0),
        "versions" if id.is_some() => (560.0, 520.0),
        _ => return Err("Janela de edição inválida.".into()),
    };
    let window = app.get_webview_window("dialog").ok_or("Janela de edição não encontrada.")?;
    let owner = app.get_webview_window("main").ok_or("Editor não encontrado.")?;
    let monitor = owner.current_monitor().map_err(|e| e.to_string())?.or(window.primary_monitor().map_err(|e| e.to_string())?);
    let (width, height) = if let Some(monitor) = &monitor {
        ((monitor.work_area().size.width as f64 / monitor.scale_factor() - 32.0).min(width),
         (monitor.work_area().size.height as f64 / monitor.scale_factor() - 32.0).min(height))
    } else { (width, height) };
    let title = match kind.as_str() { "project" if id.is_some() => "Editar projeto", "project" => "Novo projeto", "folder" if id.is_some() => "Renomear pasta", "folder" => "Nova pasta", _ => "Histórico da nota" };
    window.set_title(&format!("TopNote · {title}")).map_err(|e| e.to_string())?;
    let request = DialogRequest { request_id:uuid::Uuid::new_v4().to_string(), kind, id, project_id };
    *state.dialog.lock().map_err(|e| e.to_string())? = Some(request.clone());
    window.set_min_size(Some(LogicalSize::new(360.0, 250.0))).map_err(|e| e.to_string())?;
    window.set_size(LogicalSize::new(width.max(360.0), height.max(250.0))).map_err(|e| e.to_string())?;
    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        let size = ((width.max(360.0)*scale).round() as u32,(height.max(250.0)*scale).round() as u32);
        let position = owner.outer_position().map_err(|e| e.to_string())?;
        let owner_size = owner.outer_size().map_err(|e| e.to_string())?;
        let target = tauri::PhysicalPosition::new(position.x + (owner_size.width as i32-size.0 as i32)/2,position.y + (owner_size.height as i32-size.1 as i32)/2);
        window.set_position(native::clamp_position(target,size,&monitor)).map_err(|e| e.to_string())?;
    } else { window.center().map_err(|e| e.to_string())?; }
    window.set_always_on_top(owner.is_always_on_top().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    native::round_window(&window.as_ref().window())?;
    #[cfg(windows)]
    if let Err(error) = native::apply_window_material(&window, native::blur_enabled(&state)) { eprintln!("Material do diálogo: {error}"); }
    app.emit_to("dialog", "topnote:dialog-request", request).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn get_dialog_request(state: State<'_, AppState>) -> Result<Option<DialogRequest>, String> {
    state.dialog.lock().map(|request| request.clone()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn hide_dialog(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let window = app.get_webview_window("dialog").ok_or("Janela de edição não encontrada.")?;
    window.hide().map_err(|e| e.to_string())?;
    *state.dialog.lock().map_err(|e| e.to_string())? = None;
    app.emit_to("dialog","topnote:dialog-closed",()).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn show_projects(app: AppHandle, selected_id: Option<String>) -> Result<(), String> { native::show_projects(&app,selected_id) }
#[tauri::command]
pub fn hide_projects(app: AppHandle) -> Result<(), String> { native::hide_projects(&app) }
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
