-- Idea moodboards: an endless canvas of cards per place of work (general, a research project, a course, a syllabus).
CREATE TABLE moodboards (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  context_type  TEXT NOT NULL DEFAULT 'general',
  context_id    INTEGER,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);
CREATE UNIQUE INDEX uq_moodboard_context ON moodboards(user_id, context_type, COALESCE(context_id, 0)) WHERE deleted_at IS NULL;

CREATE TABLE moodboard_items (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board_id    INTEGER NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('note','image','link')),
  x           REAL NOT NULL DEFAULT 0,
  y           REAL NOT NULL DEFAULT 0,
  w           REAL NOT NULL DEFAULT 240,
  h           REAL NOT NULL DEFAULT 160,
  z           INTEGER NOT NULL DEFAULT 0,
  color       TEXT,
  text        TEXT,
  image_src   TEXT,
  url         TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at  TEXT
);
CREATE INDEX ix_moodboard_items ON moodboard_items(board_id, deleted_at);
