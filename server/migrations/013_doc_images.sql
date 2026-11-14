-- Pictures placed in word-processor documents (syllabi, research writing). Files live in data/doc-images; the
-- document refers to them as /api/doc-images/<id>, so documents never depend on outside links.
CREATE TABLE doc_images (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file        TEXT NOT NULL,
  mime        TEXT NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/gif')),
  width       INTEGER,
  height      INTEGER,
  bytes       INTEGER NOT NULL,
  sha256      TEXT NOT NULL,
  name        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, sha256)
);
