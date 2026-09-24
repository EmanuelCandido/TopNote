use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    pub icon: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub sort_order: f64,
    pub is_archived: bool,
    pub is_deleted: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub color: String,
    pub icon: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub sort_order: f64,
    pub is_deleted: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInput {
    pub id: Option<String>,
    pub project_id: String,
    pub name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content_json: String,
    pub content_text: String,
    pub project_id: Option<String>,
    pub folder_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub accessed_at: i64,
    pub is_pinned: bool,
    pub is_archived: bool,
    pub is_deleted: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub preview: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub folder_id: Option<String>,
    pub updated_at: i64,
    pub accessed_at: i64,
    pub is_pinned: bool,
    pub is_archived: bool,
    pub is_deleted: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePatch {
    pub id: String,
    pub title: String,
    pub content_json: String,
    pub content_text: String,
    pub project_id: Option<String>,
    pub folder_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub id: String,
    pub note_id: String,
    pub title: String,
    pub content_json: String,
    pub content_text: String,
    pub created_at: i64,
}

pub fn map_project(row: &Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, color: row.get(3)?,
        icon: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)?,
        sort_order: row.get(7)?, is_archived: row.get::<_, i64>(8)? != 0,
        is_deleted: row.get::<_, i64>(9)? != 0,
    })
}

pub fn list_projects(conn: &Connection) -> rusqlite::Result<Vec<Project>> {
    let mut stmt = conn.prepare("SELECT id,name,description,color,icon,created_at,updated_at,sort_order,is_archived,is_deleted FROM projects ORDER BY is_deleted,sort_order,created_at")?;
    let rows = stmt.query_map([], map_project)?;
    rows.collect()
}

pub fn upsert_project(conn: &Connection, input: ProjectInput) -> Result<Project, String> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 100 { return Err("O nome do projeto deve ter entre 1 e 100 caracteres.".into()); }
    let color = if input.color.len() == 7 && input.color.starts_with('#') && input.color[1..].chars().all(|c| c.is_ascii_hexdigit()) { input.color } else { "#5B8DEF".into() };
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    conn.execute(
        "INSERT INTO projects(id,name,description,color,icon,sort_order) VALUES (?1,?2,?3,?4,?5,COALESCE((SELECT max(sort_order)+1 FROM projects),0)) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,color=excluded.color,icon=excluded.icon,updated_at=unixepoch()",
        params![id, name, input.description.trim(), color, input.icon],
    ).map_err(|e| e.to_string())?;
    conn.query_row("SELECT id,name,description,color,icon,created_at,updated_at,sort_order,is_archived,is_deleted FROM projects WHERE id=?1", [&id], map_project).map_err(|e| e.to_string())
}

pub fn set_project_state(conn: &Connection, id: &str, action: &str) -> Result<(), String> {
    let sql = match action {
        "archive" => "UPDATE projects SET is_archived=1,updated_at=unixepoch() WHERE id=?1",
        "unarchive" => "UPDATE projects SET is_archived=0,updated_at=unixepoch() WHERE id=?1",
        "delete" => "UPDATE projects SET is_deleted=1,updated_at=unixepoch() WHERE id=?1",
        "restore" => "UPDATE projects SET is_deleted=0,updated_at=unixepoch() WHERE id=?1",
        _ => return Err("Ação inválida.".into()),
    };
    if conn.execute(sql, [id]).map_err(|e| e.to_string())? == 0 { return Err("Projeto não encontrado.".into()); }
    Ok(())
}

pub fn reorder_projects(conn: &mut Connection, ids: &[String]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (index, id) in ids.iter().enumerate() {
        tx.execute("UPDATE projects SET sort_order=?1 WHERE id=?2", params![index as f64, id]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

fn map_folder(row: &Row<'_>) -> rusqlite::Result<Folder> {
    Ok(Folder { id: row.get(0)?, project_id: row.get(1)?, name: row.get(2)?, sort_order: row.get(3)?, is_deleted: row.get::<_, i64>(4)? != 0 })
}

pub fn list_folders(conn: &Connection) -> rusqlite::Result<Vec<Folder>> {
    let mut stmt = conn.prepare("SELECT id,project_id,name,sort_order,is_deleted FROM folders ORDER BY sort_order,created_at")?;
    let rows = stmt.query_map([], map_folder)?;
    rows.collect()
}

pub fn upsert_folder(conn: &Connection, input: FolderInput) -> Result<Folder, String> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 100 { return Err("O nome da pasta deve ter entre 1 e 100 caracteres.".into()); }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    conn.execute("INSERT INTO folders(id,project_id,name,sort_order) VALUES (?1,?2,?3,COALESCE((SELECT max(sort_order)+1 FROM folders WHERE project_id=?2),0)) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=unixepoch()", params![id,input.project_id,name]).map_err(|e| e.to_string())?;
    conn.query_row("SELECT id,project_id,name,sort_order,is_deleted FROM folders WHERE id=?1", [&id], map_folder).map_err(|e| e.to_string())
}

pub fn set_folder_state(conn: &Connection, id: &str, deleted: bool) -> Result<(), String> {
    if conn.execute("UPDATE folders SET is_deleted=?1,updated_at=unixepoch() WHERE id=?2", params![deleted as i64,id]).map_err(|e| e.to_string())? == 0 { return Err("Pasta não encontrada.".into()); }
    Ok(())
}

pub fn reorder_folders(conn: &mut Connection, ids: &[String]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (index,id) in ids.iter().enumerate() {
        tx.execute("UPDATE folders SET sort_order=?1 WHERE id=?2", params![index as f64,id]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

fn map_note(row: &Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?, title: row.get(1)?, content_json: row.get(2)?, content_text: row.get(3)?,
        project_id: row.get(4)?, folder_id: row.get(5)?, created_at: row.get(6)?,
        updated_at: row.get(7)?, accessed_at: row.get(8)?, is_pinned: row.get::<_, i64>(9)? != 0,
        is_archived: row.get::<_, i64>(10)? != 0, is_deleted: row.get::<_, i64>(11)? != 0,
    })
}

pub fn get_note(conn: &Connection, id: &str) -> rusqlite::Result<Option<Note>> {
    conn.query_row("SELECT id,title,content_json,content_text,project_id,folder_id,created_at,updated_at,accessed_at,is_pinned,is_archived,is_deleted FROM notes WHERE id=?1", [id], map_note).optional()
}

pub fn new_note(conn: &Connection, project_id: Option<&str>, folder_id: Option<&str>) -> Result<Note, String> {
    validate_folder(conn, project_id, folder_id)?;
    let id = Uuid::new_v4().to_string();
    conn.execute("INSERT INTO notes(id,project_id,folder_id) VALUES (?1,?2,?3)", params![id,project_id,folder_id]).map_err(|e| e.to_string())?;
    get_note(conn, &id).map_err(|e| e.to_string())?.ok_or_else(|| "Não foi possível criar a nota.".into())
}

fn validate_folder(conn: &Connection, project_id: Option<&str>, folder_id: Option<&str>) -> Result<(), String> {
    if let Some(folder) = folder_id {
        let owner: Option<String> = conn.query_row("SELECT project_id FROM folders WHERE id=?1 AND is_deleted=0", [folder], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        if owner.as_deref() != project_id { return Err("A pasta não pertence ao projeto selecionado.".into()); }
    }
    Ok(())
}

pub fn save_note(conn: &mut Connection, patch: NotePatch) -> Result<Note, String> {
    if patch.title.chars().count() > 300 { return Err("O título é muito longo.".into()); }
    if patch.content_json.len() > 5_000_000 { return Err("A nota excede o limite de 5 MB.".into()); }
    let parsed: serde_json::Value = serde_json::from_str(&patch.content_json).map_err(|_| "Conteúdo da nota inválido.".to_string())?;
    if parsed.get("type").and_then(|v| v.as_str()) != Some("doc") { return Err("Conteúdo da nota inválido.".into()); }
    validate_folder(conn, patch.project_id.as_deref(), patch.folder_id.as_deref())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let old = get_note(&tx, &patch.id).map_err(|e| e.to_string())?.ok_or_else(|| "Nota não encontrada.".to_string())?;
    if old.content_json != patch.content_json || old.title != patch.title {
        let last: Option<i64> = tx.query_row("SELECT max(created_at) FROM note_versions WHERE note_id=?1", [&patch.id], |r| r.get(0)).map_err(|e| e.to_string())?;
        if (!old.content_text.is_empty() || !old.title.is_empty()) && last.map_or(true, |time| time <= old.updated_at - 300) {
            tx.execute("INSERT INTO note_versions(id,note_id,title,content_json,content_text) VALUES (?1,?2,?3,?4,?5)", params![Uuid::new_v4().to_string(),old.id,old.title,old.content_json,old.content_text]).map_err(|e| e.to_string())?;
        }
    }
    tx.execute("UPDATE notes SET title=?1,content_json=?2,content_text=?3,project_id=?4,folder_id=?5,updated_at=unixepoch() WHERE id=?6", params![patch.title.trim(),patch.content_json,patch.content_text,patch.project_id,patch.folder_id,patch.id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    get_note(conn, &patch.id).map_err(|e| e.to_string())?.ok_or_else(|| "Nota não encontrada.".into())
}

fn map_summary(row: &Row<'_>) -> rusqlite::Result<NoteSummary> {
    Ok(NoteSummary {
        id: row.get(0)?, title: row.get(1)?, preview: row.get(2)?, project_id: row.get(3)?,
        project_name: row.get(4)?, folder_id: row.get(5)?, updated_at: row.get(6)?,
        accessed_at: row.get(7)?, is_pinned: row.get::<_,i64>(8)? != 0,
        is_archived: row.get::<_,i64>(9)? != 0, is_deleted: row.get::<_,i64>(10)? != 0,
    })
}

const SUMMARY_SELECT: &str = "SELECT n.id,n.title,substr(n.content_text,1,220),n.project_id,p.name,n.folder_id,n.updated_at,n.accessed_at,n.is_pinned,n.is_archived,n.is_deleted FROM notes n LEFT JOIN projects p ON p.id=n.project_id";

pub fn list_notes(conn: &Connection, view: &str, target_id: Option<&str>, offset: i64) -> Result<Vec<NoteSummary>, String> {
    let where_sql = match view {
        "inbox" => "n.is_deleted=0 AND n.is_archived=0 AND n.project_id IS NULL",
        "all" => "n.is_deleted=0 AND n.is_archived=0",
        "favorites" => "n.is_deleted=0 AND n.is_archived=0 AND n.is_pinned=1",
        "recent" => "n.is_deleted=0 AND n.is_archived=0",
        "trash" => "n.is_deleted=1",
        "archive" => "n.is_deleted=0 AND n.is_archived=1",
        "project" => "n.is_deleted=0 AND n.is_archived=0 AND n.project_id=?1",
        "folder" => "n.is_deleted=0 AND n.is_archived=0 AND n.folder_id=?1",
        _ => return Err("Visualização inválida.".into()),
    };
    let order = if view == "recent" { "n.accessed_at DESC" } else { "n.is_pinned DESC,n.updated_at DESC" };
    let sql = format!("{SUMMARY_SELECT} WHERE {where_sql} ORDER BY {order} LIMIT 200 OFFSET ?2");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![target_id, offset.max(0)], map_summary).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

pub fn search_notes(conn: &Connection, query: &str) -> Result<Vec<NoteSummary>, String> {
    let terms: Vec<String> = query.split_whitespace().filter_map(|part| {
        let clean: String = part.chars().filter(|c| c.is_alphanumeric()).collect();
        if clean.is_empty() { None } else { Some(format!("\"{}\"*", clean)) }
    }).take(8).collect();
    if terms.is_empty() { return Ok(Vec::new()); }
    let fts = terms.join(" AND ");
    let like = format!("%{}%", query.trim());
    let sql = format!("{SUMMARY_SELECT} WHERE n.is_deleted=0 AND (n.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?1) OR p.name LIKE ?2 OR EXISTS (SELECT 1 FROM folders f WHERE f.id=n.folder_id AND f.name LIKE ?2) OR EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id=nt.tag_id WHERE nt.note_id=n.id AND t.name LIKE ?2)) ORDER BY n.is_pinned DESC,n.updated_at DESC LIMIT 100");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![fts,like], map_summary).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

pub fn touch_note(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE notes SET accessed_at=unixepoch() WHERE id=?1", [id])?;
    Ok(())
}

pub fn set_note_state(conn: &Connection, id: &str, action: &str) -> Result<(), String> {
    let sql = match action {
        "pin" => "UPDATE notes SET is_pinned=1 WHERE id=?1",
        "unpin" => "UPDATE notes SET is_pinned=0 WHERE id=?1",
        "archive" => "UPDATE notes SET is_archived=1,updated_at=unixepoch() WHERE id=?1",
        "unarchive" => "UPDATE notes SET is_archived=0,updated_at=unixepoch() WHERE id=?1",
        "delete" => "UPDATE notes SET is_deleted=1,updated_at=unixepoch() WHERE id=?1",
        "restore" => "UPDATE notes SET is_deleted=0,updated_at=unixepoch() WHERE id=?1",
        "permanent" => "DELETE FROM notes WHERE id=?1 AND is_deleted=1",
        _ => return Err("Ação inválida.".into()),
    };
    if conn.execute(sql, [id]).map_err(|e| e.to_string())? == 0 { return Err("Nota não encontrada.".into()); }
    Ok(())
}

pub fn get_tags(conn: &Connection, note_id: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT t.name FROM tags t JOIN note_tags nt ON nt.tag_id=t.id WHERE nt.note_id=?1 ORDER BY t.name")?;
    let rows = stmt.query_map([note_id], |r| r.get(0))?;
    rows.collect()
}

pub fn set_tags(conn: &mut Connection, note_id: &str, names: Vec<String>) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM note_tags WHERE note_id=?1", [note_id]).map_err(|e| e.to_string())?;
    for name in names.into_iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).take(20) {
        if name.chars().count() > 40 { return Err("Uma tag não pode passar de 40 caracteres.".into()); }
        tx.execute("INSERT OR IGNORE INTO tags(id,name) VALUES (?1,?2)", params![Uuid::new_v4().to_string(),name]).map_err(|e| e.to_string())?;
        tx.execute("INSERT OR IGNORE INTO note_tags(note_id,tag_id) SELECT ?1,id FROM tags WHERE name=?2", params![note_id,name]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn list_versions(conn: &Connection, note_id: &str) -> rusqlite::Result<Vec<Version>> {
    let mut stmt = conn.prepare("SELECT id,note_id,title,content_json,content_text,created_at FROM note_versions WHERE note_id=?1 ORDER BY created_at DESC LIMIT 30")?;
    let rows = stmt.query_map([note_id], |r| Ok(Version { id:r.get(0)?, note_id:r.get(1)?, title:r.get(2)?, content_json:r.get(3)?, content_text:r.get(4)?, created_at:r.get(5)? }))?;
    rows.collect()
}

pub fn restore_version(conn: &mut Connection, version_id: &str) -> Result<Note, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let conn = &tx;
    let version: Version = conn.query_row("SELECT id,note_id,title,content_json,content_text,created_at FROM note_versions WHERE id=?1", [version_id], |r| Ok(Version { id:r.get(0)?, note_id:r.get(1)?, title:r.get(2)?, content_json:r.get(3)?, content_text:r.get(4)?, created_at:r.get(5)? })).map_err(|e| e.to_string())?;
    let old = get_note(conn, &version.note_id).map_err(|e| e.to_string())?.ok_or_else(|| "Nota não encontrada.".to_string())?;
    conn.execute("INSERT INTO note_versions(id,note_id,title,content_json,content_text) VALUES (?1,?2,?3,?4,?5)",params![Uuid::new_v4().to_string(),old.id,old.title,old.content_json,old.content_text]).map_err(|e| e.to_string())?;
    conn.execute("UPDATE notes SET title=?1,content_json=?2,content_text=?3,updated_at=unixepoch() WHERE id=?4",params![version.title,version.content_json,version.content_text,version.note_id]).map_err(|e| e.to_string())?;
    let restored = get_note(conn, &version.note_id).map_err(|e| e.to_string())?.ok_or_else(|| "Nota não encontrada.".to_string())?;
    tx.commit().map_err(|e|e.to_string())?;
    Ok(restored)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrate;

    fn database() -> Connection { let mut db=Connection::open_in_memory().unwrap(); db.pragma_update(None,"foreign_keys","ON").unwrap(); migrate(&mut db).unwrap(); db }
    #[test]
    fn create_update_delete_restore_and_search() {
        let mut db=database();
        let project=upsert_project(&db,ProjectInput{id:None,name:"CliniCase".into(),description:"".into(),color:"#123456".into(),icon:"folder".into()}).unwrap();
        let folder=upsert_folder(&db,FolderInput{id:None,project_id:project.id.clone(),name:"Backend".into()}).unwrap();
        let note=new_note(&db,Some(&project.id),Some(&folder.id)).unwrap();
        save_note(&mut db,NotePatch{id:note.id.clone(),title:"Autenticação".into(),content_json:"{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"refresh token\"}]}]}".into(),content_text:"refresh token".into(),project_id:Some(project.id.clone()),folder_id:Some(folder.id.clone())}).unwrap();
        assert_eq!(search_notes(&db,"refresh").unwrap().len(),1);
        assert_eq!(search_notes(&db,"Backend").unwrap().len(),1);
        set_note_state(&db,&note.id,"delete").unwrap();
        assert!(search_notes(&db,"refresh").unwrap().is_empty());
        assert_eq!(list_notes(&db,"trash",None,0).unwrap().len(),1);
        set_note_state(&db,&note.id,"restore").unwrap();
        assert_eq!(list_notes(&db,"project",Some(&project.id),0).unwrap().len(),1);
    }
    #[test]
    fn rejects_folder_from_another_project() {
        let db=database();
        let a=upsert_project(&db,ProjectInput{id:None,name:"A".into(),description:"".into(),color:"".into(),icon:"folder".into()}).unwrap();
        let b=upsert_project(&db,ProjectInput{id:None,name:"B".into(),description:"".into(),color:"".into(),icon:"folder".into()}).unwrap();
        let folder=upsert_folder(&db,FolderInput{id:None,project_id:a.id,name:"F".into()}).unwrap();
        assert!(new_note(&db,Some(&b.id),Some(&folder.id)).is_err());
    }
}
