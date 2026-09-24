use crate::AppState;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;

const MAX_ATTACHMENT_SIZE: usize = 50 * 1024 * 1024;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub note_id: String,
    pub original_name: String,
    pub path: String,
    pub mime_type: String,
    pub byte_size: i64,
    pub created_at: i64,
}

fn mime_for(extension: &str) -> &'static str {
    match extension {
        "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif",
        "webp" => "image/webp", "bmp" => "image/bmp", "pdf" => "application/pdf",
        "txt" | "md" | "rs" | "ts" | "tsx" | "js" | "json" | "py" | "css" | "html" => "text/plain",
        "zip" => "application/zip", _ => "application/octet-stream",
    }
}

fn safe_name(name: &str) -> String {
    let basename = Path::new(name).file_name().and_then(|s| s.to_str()).unwrap_or("arquivo");
    let clean: String = basename.chars().filter(|c| !c.is_control() && !"<>:\"/\\|?*".contains(*c)).take(180).collect();
    if clean.trim().is_empty() { "arquivo".into() } else { clean }
}

pub fn list(conn: &Connection, state: &AppState, note_id: &str) -> Result<Vec<Attachment>, String> {
    let mut stmt = conn.prepare("SELECT id,note_id,original_name,stored_path,mime_type,byte_size,created_at FROM attachments WHERE note_id=?1 ORDER BY created_at").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([note_id], |r| {
        let relative: String = r.get(3)?;
        Ok(Attachment { id:r.get(0)?,note_id:r.get(1)?,original_name:r.get(2)?,path:state.root.join(relative).to_string_lossy().into_owned(),mime_type:r.get(4)?,byte_size:r.get(5)?,created_at:r.get(6)? })
    }).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

pub fn import_bytes(conn: &Connection, state: &AppState, note_id: &str, filename: &str, data: &[u8]) -> Result<Attachment, String> {
    if data.is_empty() || data.len() > MAX_ATTACHMENT_SIZE { return Err("O arquivo precisa ter entre 1 byte e 50 MB.".into()); }
    let exists: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM notes WHERE id=?1)",[note_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    if !exists { return Err("Nota não encontrada.".into()); }
    let name = safe_name(filename);
    let extension = Path::new(&name).extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
    let extension = if extension.len() <= 12 && extension.chars().all(|c| c.is_ascii_alphanumeric()) { extension } else { String::new() };
    let id = Uuid::new_v4().to_string();
    let stored = if extension.is_empty() { id.clone() } else { format!("{id}.{extension}") };
    let relative = PathBuf::from("attachments").join(note_id).join(stored);
    let path = state.safe_attachment_path(&relative.to_string_lossy())?;
    let parent = path.parent().ok_or("Caminho inválido.")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    let relative_string = relative.to_string_lossy().replace('\\', "/");
    let result = conn.execute("INSERT INTO attachments(id,note_id,original_name,stored_path,mime_type,byte_size) VALUES (?1,?2,?3,?4,?5,?6)", params![id,note_id,name,relative_string,mime_for(&extension),data.len() as i64]);
    if let Err(error) = result { let _ = fs::remove_file(&path); return Err(error.to_string()); }
    list(conn, state, note_id)?.into_iter().find(|a| a.id == id).ok_or_else(|| "Não foi possível carregar o anexo.".into())
}

pub fn import_path(conn: &Connection, state: &AppState, note_id: &str, source: &str) -> Result<Attachment, String> {
    let source_path = Path::new(source);
    let metadata = fs::metadata(source_path).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_ATTACHMENT_SIZE as u64 { return Err("Escolha um arquivo de até 50 MB.".into()); }
    let data = fs::read(source_path).map_err(|e| e.to_string())?;
    import_bytes(conn,state,note_id,source_path.file_name().and_then(|s| s.to_str()).unwrap_or("arquivo"),&data)
}

pub fn delete(conn: &Connection, state: &AppState, id: &str) -> Result<(), String> {
    let relative: String = conn.query_row("SELECT stored_path FROM attachments WHERE id=?1", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
    let path = state.safe_attachment_path(&relative)?;
    conn.execute("DELETE FROM attachments WHERE id=?1", [id]).map_err(|e| e.to_string())?;
    if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; }
    Ok(())
}

pub fn stage_drag_file(conn: &Connection, state: &AppState, id: &str) -> Result<PathBuf, String> {
    let (relative, original_name): (String, String) = conn
        .query_row("SELECT stored_path,original_name FROM attachments WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|_| "Anexo não encontrado.".to_string())?;
    let source = state.safe_attachment_path(&relative)?;
    if !source.is_file() { return Err("O arquivo anexado não está mais disponível.".into()); }

    let directory = state.root.join("drag-out").join(Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let staged = directory.join(safe_name(&original_name));
    if fs::hard_link(&source, &staged).is_err() {
        if let Err(error) = fs::copy(&source, &staged) {
            let _ = fs::remove_dir(&directory);
            return Err(error.to_string());
        }
    }
    Ok(staged)
}

pub fn remove_staged_drag_file(path: &Path) {
    let _ = fs::remove_file(path);
    if let Some(directory) = path.parent() { let _ = fs::remove_dir(directory); }
}

pub fn cleanup_old_drag_files(state: &AppState) {
    let root = state.root.join("drag-out");
    let Ok(entries) = fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let directory = entry.path();
        if !entry.file_type().is_ok_and(|kind| kind.is_dir()) ||
            !directory.file_name().and_then(|name| name.to_str()).is_some_and(|name| Uuid::parse_str(name).is_ok()) { continue }
        let old = entry.metadata().and_then(|meta| meta.modified()).ok()
            .and_then(|modified| modified.elapsed().ok()).is_some_and(|age| age > Duration::from_secs(86_400));
        if !old { continue }
        let Ok(mut files) = fs::read_dir(&directory) else { continue };
        let Some(Ok(file)) = files.next() else { continue };
        if files.next().is_some() || !file.file_type().is_ok_and(|kind| kind.is_file()) { continue }
        remove_staged_drag_file(&file.path());
    }
}

pub fn remove_note_files(conn: &Connection, state: &AppState, note_id: &str) -> Result<(), String> {
    let files = list(conn,state,note_id)?;
    for file in files {
        let path = PathBuf::from(file.path);
        if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository;

    #[test]
    fn drag_copy_keeps_original_name_and_attached_file() {
        let temporary = tempfile::tempdir().unwrap();
        let state = AppState::new(temporary.path().join("data")).unwrap();
        let connection = state.connection().unwrap();
        let note = repository::new_note(&connection, None, None).unwrap();
        let attachment = import_bytes(&connection, &state, &note.id, "Prompt - Copia.txt", b"conteudo").unwrap();

        let staged = stage_drag_file(&connection, &state, &attachment.id).unwrap();
        assert_eq!(staged.file_name().unwrap().to_string_lossy(), "Prompt - Copia.txt");
        assert_eq!(fs::read(&staged).unwrap(), b"conteudo");

        remove_staged_drag_file(&staged);
        assert!(!staged.exists());
        assert_eq!(fs::read(&attachment.path).unwrap(), b"conteudo");
    }
}
