-- School calendar: the dates of the academic calendar your school releases, read from the file you import.
CREATE TABLE calendar_imports (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name    TEXT,
  school_year  TEXT,
  items        INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  removed_at   TEXT
);

CREATE TABLE school_calendar (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT,
  kind        TEXT NOT NULL DEFAULT 'event',
  no_classes  INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  import_id   INTEGER REFERENCES calendar_imports(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at  TEXT
);
CREATE INDEX ix_school_calendar_dates ON school_calendar(user_id, start_date, end_date) WHERE deleted_at IS NULL;
