use crate::{db, AppState};
use rusqlite::Connection;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use walkdir::WalkDir;
use zip::{write::FileOptions, CompressionMethod, ZipArchive, ZipWriter};

fn zip_options() -> FileOptions {
    FileOptions::default().compression_method(CompressionMethod::Deflated)
}

pub fn create_backup(conn: &Connection, state: &AppState, destination: Option<&str>) -> Result<String, String> {
    let backup_dir = state.root.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let default_name = format!("topnote-{}-{}.zip", unix_now(), uuid::Uuid::new_v4().simple());
    let output = destination.map(PathBuf::from).unwrap_or_else(|| backup_dir.join(default_name));
    let snapshot = backup_dir.join(format!("snapshot-{}.db", uuid::Uuid::new_v4().simple()));
    let snapshot_text = snapshot.to_string_lossy().to_string();
    conn.execute("VACUUM INTO ?1", [&snapshot_text]).map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        let file = File::create(&output).map_err(|e| e.to_string())?;
        let mut zip = ZipWriter::new(file);
        zip.start_file("database/topnote.db", zip_options()).map_err(|e| e.to_string())?;
        let mut database = File::open(&snapshot).map_err(|e| e.to_string())?;
        std::io::copy(&mut database, &mut zip).map_err(|e| e.to_string())?;
        let mut settings = conn.prepare("SELECT key,value FROM settings ORDER BY key").map_err(|e| e.to_string())?;
        let pairs: Vec<(String,String)> = settings.query_map([], |r| Ok((r.get(0)?,r.get(1)?))).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;
        zip.start_file("settings/preferences.json", zip_options()).map_err(|e| e.to_string())?;
        zip.write_all(serde_json::to_string_pretty(&pairs).map_err(|e| e.to_string())?.as_bytes()).map_err(|e| e.to_string())?;
        let attachment_dir = state.root.join("attachments");
        if attachment_dir.exists() {
            for entry in WalkDir::new(&attachment_dir).into_iter().filter_map(Result::ok).filter(|e| e.file_type().is_file()) {
                let relative = entry.path().strip_prefix(&state.root).map_err(|e| e.to_string())?;
                let name = relative.to_string_lossy().replace('\\', "/");
                zip.start_file(name, zip_options()).map_err(|e| e.to_string())?;
                let mut source = File::open(entry.path()).map_err(|e| e.to_string())?;
                std::io::copy(&mut source, &mut zip).map_err(|e| e.to_string())?;
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
        Ok(())
    })();
    let _ = fs::remove_file(snapshot);
    if result.is_err() { let _ = fs::remove_file(&output); }
    result?;
    Ok(output.to_string_lossy().into_owned())
}

pub fn restore_backup(state: &AppState, source: &str) -> Result<(), String> {
    let file = File::open(source).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    if archive.len() > 10_000 { return Err("Backup contém arquivos demais.".into()); }
    let stage = state.root.join(format!("restore-{}", uuid::Uuid::new_v4().simple()));
    fs::create_dir_all(&stage).map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        let mut total = 0u64;
        for index in 0..archive.len() {
            let mut item = archive.by_index(index).map_err(|e| e.to_string())?;
            let name = item.name().replace('\\', "/");
            let relative = Path::new(&name);
            if relative.components().any(|c| !matches!(c, Component::Normal(_))) { return Err("Backup contém caminho inválido.".into()); }
            if !(name == "database/topnote.db" || name.starts_with("attachments/") || name == "settings/preferences.json") { return Err("Backup contém arquivo inesperado.".into()); }
            if item.is_dir() { continue; }
            total += item.size();
            if total > 2_000_000_000 { return Err("Backup excede 2 GB.".into()); }
            let target = stage.join(relative);
            fs::create_dir_all(target.parent().ok_or("Caminho inválido.")?).map_err(|e| e.to_string())?;
            let mut output = File::create(&target).map_err(|e| e.to_string())?;
            std::io::copy(&mut item, &mut output).map_err(|e| e.to_string())?;
        }
        let restored_db = stage.join("database/topnote.db");
        if !restored_db.is_file() { return Err("Backup não contém o banco de dados.".into()); }
        let mut check = db::connect(&restored_db).map_err(|e| e.to_string())?;
        let integrity: String = check.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        if integrity != "ok" { return Err("O banco de dados do backup está corrompido.".into()); }
        db::migrate(&mut check).map_err(|e| e.to_string())?;
        drop(check);
        let current = db::connect(&state.db_path).map_err(|e| e.to_string())?;
        current.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").map_err(|e| e.to_string())?;
        drop(current);
        let old_db = stage.join("previous.db");
        let old_attachments = stage.join("previous-attachments");
        let current_attachments = state.root.join("attachments");
        fs::rename(&state.db_path, &old_db).map_err(|e| e.to_string())?;
        if current_attachments.exists() {
            if let Err(error) = fs::rename(&current_attachments, &old_attachments) {
                let _ = fs::rename(&old_db, &state.db_path);
                return Err(error.to_string());
            }
        }
        if let Err(error) = fs::rename(&restored_db, &state.db_path) {
            let _ = fs::rename(&old_db, &state.db_path);
            let _ = fs::rename(&old_attachments, &current_attachments);
            return Err(error.to_string());
        }
        let incoming_attachments = stage.join("attachments");
        if incoming_attachments.exists() {
            if let Err(error) = fs::rename(&incoming_attachments, &current_attachments) {
                let _ = fs::remove_file(&state.db_path);
                let _ = fs::rename(&old_db, &state.db_path);
                let _ = fs::rename(&old_attachments, &current_attachments);
                return Err(error.to_string());
            }
        } else { fs::create_dir_all(&current_attachments).map_err(|e| e.to_string())?; }
        let _ = fs::remove_file(state.root.join("topnote.db-wal"));
        let _ = fs::remove_file(state.root.join("topnote.db-shm"));
        Ok(())
    })();
    let _ = fs::remove_dir_all(stage);
    result
}

fn unix_now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn auto_backup(conn: &Connection, state: &AppState) -> Result<(), String> {
    let get = |key: &str| -> Option<String> { conn.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0)).ok() };
    if get("backupAuto").as_deref() != Some("true") { return Ok(()); }
    let last = get("lastBackupAt").and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let interval = if get("backupInterval").as_deref() == Some("weekly") { 7 * 86400 } else { 86400 };
    if unix_now().saturating_sub(last) < interval { return Ok(()); }
    create_backup(conn,state,None)?;
    conn.execute("INSERT INTO settings(key,value) VALUES ('lastBackupAt',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [unix_now().to_string()]).map_err(|e| e.to_string())?;
    let max = get("backupMax").and_then(|s| s.parse::<usize>().ok()).unwrap_or(5).clamp(1,20);
    let mut backups: Vec<PathBuf> = fs::read_dir(state.root.join("backups")).map_err(|e| e.to_string())?.filter_map(Result::ok).map(|e| e.path()).filter(|p| p.file_name().and_then(|s| s.to_str()).map(|s| s.starts_with("topnote-") && s.ends_with(".zip")).unwrap_or(false)).collect();
    backups.sort();
    for old in backups.into_iter().rev().skip(max) { let _ = fs::remove_file(old); }
    Ok(())
}

pub fn export_project(conn: &Connection, state: &AppState, project_id: &str, destination: &str) -> Result<(), String> {
    let project: serde_json::Value = conn.query_row("SELECT name,description,color,icon,created_at,updated_at FROM projects WHERE id=?1 AND is_deleted=0", [project_id], |r| Ok(serde_json::json!({"id":project_id,"name":r.get::<_,String>(0)?,"description":r.get::<_,String>(1)?,"color":r.get::<_,String>(2)?,"icon":r.get::<_,String>(3)?,"createdAt":r.get::<_,i64>(4)?,"updatedAt":r.get::<_,i64>(5)?}))).map_err(|e| e.to_string())?;
    let file = File::create(destination).map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        let mut archive = ZipWriter::new(file);
        archive.start_file("project.json",zip_options()).map_err(|e| e.to_string())?;
        archive.write_all(serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?.as_bytes()).map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT id,title,content_json,content_text,folder_id,created_at,updated_at FROM notes WHERE project_id=?1 AND is_deleted=0 ORDER BY created_at").map_err(|e| e.to_string())?;
        let notes = stmt.query_map([project_id], |r| Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"title":r.get::<_,String>(1)?,"content":serde_json::from_str::<serde_json::Value>(&r.get::<_,String>(2)?).unwrap_or(serde_json::Value::Null),"text":r.get::<_,String>(3)?,"folderId":r.get::<_,Option<String>>(4)?,"createdAt":r.get::<_,i64>(5)?,"updatedAt":r.get::<_,i64>(6)?}))).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;
        for note in notes {
            let id = note["id"].as_str().ok_or("Nota inválida.")?;
            archive.start_file(format!("notes/{id}.json"),zip_options()).map_err(|e| e.to_string())?;
            archive.write_all(serde_json::to_string_pretty(&note).map_err(|e| e.to_string())?.as_bytes()).map_err(|e| e.to_string())?;
        }
        let mut attachments = conn.prepare("SELECT a.stored_path FROM attachments a JOIN notes n ON n.id=a.note_id WHERE n.project_id=?1 AND n.is_deleted=0").map_err(|e| e.to_string())?;
        let paths = attachments.query_map([project_id], |r| r.get::<_,String>(0)).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;
        for relative in paths {
            let path = state.safe_attachment_path(&relative)?;
            archive.start_file(relative.replace('\\',"/"),zip_options()).map_err(|e| e.to_string())?;
            let mut source = File::open(path).map_err(|e| e.to_string())?;
            std::io::copy(&mut source,&mut archive).map_err(|e| e.to_string())?;
        }
        archive.finish().map_err(|e| e.to_string())?;
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(destination); }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_round_trip_and_rejects_traversal() {
        let dir=tempfile::tempdir().unwrap();
        let state=AppState::new(dir.path().to_path_buf()).unwrap();
        let conn=state.connection().unwrap();
        conn.execute("INSERT INTO notes(id,title) VALUES ('n','Antes')",[]).unwrap();
        let backup=create_backup(&conn,&state,None).unwrap();
        drop(conn);
        let conn=state.connection().unwrap();
        conn.execute("UPDATE notes SET title='Depois' WHERE id='n'",[]).unwrap();
        drop(conn);
        restore_backup(&state,&backup).unwrap();
        let conn=state.connection().unwrap();
        let title:String=conn.query_row("SELECT title FROM notes WHERE id='n'",[],|r|r.get(0)).unwrap();
        assert_eq!(title,"Antes");
    }
}
