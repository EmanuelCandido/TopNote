CREATE VIRTUAL TABLE notes_fts USING fts5(
  title,
  content_text,
  content='notes',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content_text) VALUES (new.rowid, new.title, new.content_text);
END;
CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_text) VALUES ('delete', old.rowid, old.title, old.content_text);
END;
CREATE TRIGGER notes_au AFTER UPDATE OF title, content_text ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_text) VALUES ('delete', old.rowid, old.title, old.content_text);
  INSERT INTO notes_fts(rowid, title, content_text) VALUES (new.rowid, new.title, new.content_text);
END;
INSERT INTO notes_fts(notes_fts) VALUES ('rebuild');
