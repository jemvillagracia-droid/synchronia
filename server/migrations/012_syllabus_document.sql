-- Syllabi are edited as word-processor documents. document_json holds the document; page_json the page setup.
-- Structured content (content_json) is kept: an existing syllabus is converted into a document the first time it is
-- opened, and the original structure stays in the record.
ALTER TABLE syllabi ADD COLUMN document_json TEXT;
ALTER TABLE syllabi ADD COLUMN page_json TEXT;

-- Recovery points: one at most every ten minutes while editing, plus one before each restore and conversion.
CREATE TABLE syllabus_snapshots (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  syllabus_id    INTEGER NOT NULL REFERENCES syllabi(id) ON DELETE CASCADE,
  document_json  TEXT NOT NULL,
  page_json      TEXT,
  words          INTEGER NOT NULL DEFAULT 0,
  reason         TEXT NOT NULL DEFAULT 'autosave',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_syllabus_snapshots ON syllabus_snapshots(syllabus_id, created_at);
