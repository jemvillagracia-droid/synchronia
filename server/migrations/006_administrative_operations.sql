-- Phase 6: Administrative Operations — registries with routing, meetings and minutes, secretariat records,
-- daily activity log and turnover documentation. Existing correspondence is kept; new columns are optional.

ALTER TABLE administrative_transactions ADD COLUMN doc_type TEXT;
ALTER TABLE administrative_transactions ADD COLUMN action_required TEXT;
ALTER TABLE administrative_transactions ADD COLUMN action_taken TEXT;
ALTER TABLE administrative_transactions ADD COLUMN completed_date TEXT;

-- One row per routing step, so follow-ups and turnover can see where each document is.
CREATE TABLE document_routes (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id    INTEGER NOT NULL REFERENCES administrative_transactions(id) ON DELETE CASCADE,
  routed_date       TEXT NOT NULL,
  routed_to         TEXT NOT NULL,
  action_requested  TEXT,
  due_date          TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acted','returned')),
  acted_date        TEXT,
  remarks           TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_routes_tx ON document_routes(transaction_id);
CREATE INDEX idx_routes_pending ON document_routes(user_id, status);

CREATE TABLE meetings (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  body            TEXT,                         -- board, council or committee convening the meeting
  committee_id    INTEGER REFERENCES committee_assignments(id) ON DELETE SET NULL,
  meeting_type    TEXT CHECK (meeting_type IN ('regular','special','committee','consultation','planning','other')),
  meeting_date    TEXT NOT NULL,
  start_time      TEXT,
  end_time        TEXT,
  venue           TEXT,
  mode            TEXT CHECK (mode IN ('in_person','online','hybrid')),
  role            TEXT CHECK (role IN ('secretary','presiding_officer','member','attendee','resource_person')),
  status          TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','held','postponed','cancelled')),
  presiding       TEXT,
  attendees       TEXT,
  absent          TEXT,
  agenda_json     TEXT,
  minutes_json    TEXT,
  minutes_status  TEXT NOT NULL DEFAULT 'none' CHECK (minutes_status IN ('none','draft','for_approval','approved')),
  remarks         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);
CREATE INDEX idx_meetings_date ON meetings(user_id, meeting_date);

CREATE TABLE secretariat_records (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_type      TEXT NOT NULL CHECK (record_type IN ('resolution','minutes','notice_of_meeting','certification','memorandum','referendum','excerpt','other')),
  record_no        TEXT,
  title            TEXT NOT NULL,
  issuing_body     TEXT,
  meeting_id       INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
  record_date      TEXT,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','for_signature','signed','disseminated','archived')),
  signatories      TEXT,
  disseminated_to  TEXT,
  remarks          TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at       TEXT
);

CREATE TABLE daily_logs (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date     TEXT NOT NULL,
  start_time   TEXT,
  end_time     TEXT,
  activity     TEXT NOT NULL,
  category     TEXT CHECK (category IN ('correspondence','meeting','secretariat','records','clerical','coordination','reports','teaching','research','extension','other')),
  output       TEXT,
  quantity     INTEGER,
  remarks      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at   TEXT
);
CREATE INDEX idx_daily_logs_date ON daily_logs(user_id, log_date);

CREATE TABLE turnover_documents (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  office          TEXT,
  position        TEXT,
  successor_name  TEXT,
  successor_position TEXT,
  effective_date  TEXT,
  noted_by        TEXT,
  noted_by_title  TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  notes_json      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);

-- Carry over routing notes that older versions kept as JSON, so nothing recorded is lost.
INSERT INTO document_routes (user_id, transaction_id, routed_date, routed_to, action_requested, status, remarks)
SELECT t.user_id, t.id,
       COALESCE(json_extract(r.value, '$.date'), t.logged_date, substr(t.created_at, 1, 10)),
       COALESCE(json_extract(r.value, '$.to'), json_extract(r.value, '$.office'), 'Unspecified'),
       json_extract(r.value, '$.action'), 'pending', json_extract(r.value, '$.remarks')
FROM administrative_transactions t, json_each(CASE WHEN json_valid(t.routing_json) AND json_type(t.routing_json) = 'array' THEN t.routing_json ELSE '[]' END) r;
