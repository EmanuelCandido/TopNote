use rusqlite::{Connection, OptionalExtension};
use std::path::Path;
use std::time::Duration;

const MIGRATIONS: [&str; 2] = [
    include_str!("../migrations/001_core.sql"),
    include_str!("../migrations/002_search.sql"),
];

pub fn connect(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    Ok(conn)
}

pub fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch()));",
    )?;
    for (index, sql) in MIGRATIONS.iter().enumerate() {
        let version = (index + 1) as i64;
        let applied: Option<i64> = conn
            .query_row(
                "SELECT version FROM schema_migrations WHERE version=?1",
                [version],
                |row| row.get(0),
            )
            .optional()?;
        if applied.is_none() {
            let transaction = conn.transaction()?;
            transaction.execute_batch(sql)?;
            transaction.execute("INSERT INTO schema_migrations(version) VALUES (?1)", [version])?;
            transaction.commit()?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_idempotent_and_create_search() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        migrate(&mut conn).unwrap();
        let count: i64 = conn.query_row("SELECT count(*) FROM schema_migrations", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 2);
        conn.execute("INSERT INTO notes(id,title,content_text) VALUES ('n','Teste','busca rápida')", []).unwrap();
        let found: i64 = conn.query_row("SELECT count(*) FROM notes_fts WHERE notes_fts MATCH 'busca'", [], |r| r.get(0)).unwrap();
        assert_eq!(found, 1);
    }
}
