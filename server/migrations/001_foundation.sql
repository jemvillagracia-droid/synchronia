-- SYNCHRONIA — Phase 1 foundation schema
-- Conventions
--   * Every owned record carries user_id and is scoped to its owner.
--   * created_at / updated_at are record-keeping timestamps (UTC ISO-8601).
--   * Event dates (start_date, date_received, ...) are separate 'YYYY-MM-DD' text,
--     so retrospective entries keep the real event date apart from creation date.
--   * deleted_at implements the recycle bin: rows are soft-deleted and restorable.
--   * verification distinguishes self-reported data from confirmed / evidenced data.
--     Nothing is shown as verified unless the user confirmed it or evidence is linked.

PRAGMA foreign_keys = ON;

-- ───────────────────────── Identity & access ─────────────────────────
CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Application preferences (one row per user)
CREATE TABLE user_profiles (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  academic_mode      TEXT NOT NULL DEFAULT 'administrative'
                     CHECK (academic_mode IN ('administrative','instructor','researcher','faculty_development')),
  dashboard_layout   TEXT,               -- JSON: [{ "id": "...", "visible": true }]
  context_panel_open INTEGER NOT NULL DEFAULT 1,
  sidebar_collapsed  INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ───────────────────────── Media & evidence ─────────────────────────
CREATE TABLE uploaded_images (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label           TEXT,
  original_name   TEXT NOT NULL,
  original_path   TEXT NOT NULL,          -- original file is always preserved
  optimized_path  TEXT,                   -- derived copy used for CV rendering
  mime_type       TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes      INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 104857600),
  sha256          TEXT NOT NULL,
  width           INTEGER,
  height          INTEGER,
  crop_json       TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);

-- References to documents that live elsewhere (Google Drive, URLs). No file duplication.
CREATE TABLE external_file_references (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL CHECK (provider IN ('google_drive','url','local_path')),
  external_id    TEXT,                    -- Drive file id when provider = google_drive
  url            TEXT,
  title          TEXT NOT NULL,
  mime_type      TEXT,
  metadata_json  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);

-- Polymorphic link between any record and a supporting file reference
CREATE TABLE evidence_links (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_ref_id  INTEGER NOT NULL REFERENCES external_file_references(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL,
  entity_id    INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (file_ref_id, entity_type, entity_id)
);
CREATE INDEX idx_evidence_entity ON evidence_links(entity_type, entity_id);

-- ───────────────────────── Professional portfolio ─────────────────────────
CREATE TABLE professional_profiles (
  id                    INTEGER PRIMARY KEY,
  user_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name             TEXT,
  professional_title    TEXT,
  academic_designation  TEXT,
  biography             TEXT,
  email                 TEXT,
  phone                 TEXT,
  address               TEXT,
  website               TEXT,
  specialization        TEXT,
  research_interests    TEXT,
  current_position      TEXT,
  current_office        TEXT,
  current_institution   TEXT,
  career_goal           TEXT,             -- e.g. "Instructor I"
  photo_image_id        INTEGER REFERENCES uploaded_images(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE education_records (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  degree           TEXT NOT NULL,
  major            TEXT,
  institution      TEXT NOT NULL,
  location         TEXT,
  start_date       TEXT,
  end_date         TEXT,
  graduation_date  TEXT,
  status           TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','ongoing','units_earned')),
  distinctions     TEXT,
  verification     TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at       TEXT
);
CREATE UNIQUE INDEX uq_education ON education_records(user_id, degree, institution, IFNULL(graduation_date,'')) WHERE deleted_at IS NULL;

CREATE TABLE licenses (
  id                         INTEGER PRIMARY KEY,
  user_id                    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  license_type               TEXT NOT NULL,
  registration_number_enc    TEXT,        -- AES-256-GCM ciphertext, never stored in plain text
  registration_number_last4  TEXT,
  issuing_authority          TEXT NOT NULL,
  registration_date          TEXT,
  valid_until                TEXT,
  verification               TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  notes                      TEXT,
  created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at                 TEXT
);
CREATE UNIQUE INDEX uq_license ON licenses(user_id, license_type, issuing_authority) WHERE deleted_at IS NULL;

CREATE TABLE employment_records (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position          TEXT NOT NULL,
  institution       TEXT NOT NULL,
  office            TEXT,
  employment_type   TEXT,
  start_date        TEXT,
  end_date          TEXT,
  is_current        INTEGER NOT NULL DEFAULT 0,
  responsibilities  TEXT,
  accomplishments   TEXT,
  verification      TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

CREATE TABLE academic_appointments (
  id                         INTEGER PRIMARY KEY,
  user_id                    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  academic_rank              TEXT NOT NULL,
  faculty_designation        TEXT,
  institution                TEXT NOT NULL,
  department                 TEXT,
  start_date                 TEXT,
  end_date                   TEXT,
  is_current                 INTEGER NOT NULL DEFAULT 0,
  teaching_responsibilities  TEXT,
  verification               TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  notes                      TEXT,
  created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at                 TEXT
);

CREATE TABLE training_records (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  training_type  TEXT NOT NULL DEFAULT 'training' CHECK (training_type IN ('training','seminar','workshop','conference','webinar','course','certification','other')),
  role           TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant','speaker','facilitator','organizer')),
  organizer      TEXT,
  location       TEXT,
  start_date     TEXT,
  end_date       TEXT,
  hours          REAL CHECK (hours IS NULL OR hours >= 0),
  cpd_units      REAL CHECK (cpd_units IS NULL OR cpd_units >= 0),
  verification   TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);
CREATE UNIQUE INDEX uq_training ON training_records(user_id, title, IFNULL(start_date,'')) WHERE deleted_at IS NULL;

CREATE TABLE awards (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  issuer         TEXT,
  date_received  TEXT,
  level          TEXT,
  description    TEXT,
  verification   TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);

CREATE TABLE professional_memberships (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization     TEXT NOT NULL,
  membership_type  TEXT,
  member_id        TEXT,
  start_date       TEXT,
  end_date         TEXT,
  is_current       INTEGER NOT NULL DEFAULT 0,
  verification     TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at       TEXT
);

CREATE TABLE committee_assignments (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  committee        TEXT NOT NULL,
  role             TEXT,
  institution      TEXT,
  assignment_type  TEXT NOT NULL DEFAULT 'committee' CHECK (assignment_type IN ('committee','secretariat','administrative','institutional_project','academic_service','leadership')),
  start_date       TEXT,
  end_date         TEXT,
  is_current       INTEGER NOT NULL DEFAULT 0,
  description      TEXT,
  verification     TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at       TEXT
);

-- General accomplishments and portfolio items that do not fit a specific table
CREATE TABLE portfolio_entries (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL DEFAULT 'accomplishment',
  title         TEXT NOT NULL,
  description   TEXT,
  event_date    TEXT,
  verification  TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- ───────────────────────── Teaching ─────────────────────────
CREATE TABLE courses (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  units        REAL,
  program      TEXT,
  level        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at   TEXT
);
CREATE UNIQUE INDEX uq_course ON courses(user_id, code, IFNULL(program,'')) WHERE deleted_at IS NULL;

CREATE TABLE teaching_assignments (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  appointment_id  INTEGER REFERENCES academic_appointments(id) ON DELETE SET NULL,
  academic_year   TEXT NOT NULL,           -- e.g. 2026-2027
  semester        TEXT NOT NULL CHECK (semester IN ('first','second','summer','other')),
  section         TEXT,
  schedule        TEXT,
  student_count   INTEGER,
  status          TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);

CREATE TABLE syllabi (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id      INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  version_label  TEXT NOT NULL DEFAULT 'v1',
  academic_year  TEXT,
  semester       TEXT,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','for_review','approved','archived')),
  content_json   TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);

CREATE TABLE learning_outcomes (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id     INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  syllabus_id   INTEGER REFERENCES syllabi(id) ON DELETE CASCADE,
  outcome_type  TEXT NOT NULL CHECK (outcome_type IN ('CLO','PO','ILO')),
  code          TEXT NOT NULL,
  description   TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

CREATE TABLE outcome_alignments (
  course_outcome_id   INTEGER NOT NULL REFERENCES learning_outcomes(id) ON DELETE CASCADE,
  program_outcome_id  INTEGER NOT NULL REFERENCES learning_outcomes(id) ON DELETE CASCADE,
  level               TEXT,               -- e.g. I / E / D (introduced, enhanced, demonstrated)
  PRIMARY KEY (course_outcome_id, program_outcome_id)
);

CREATE TABLE instructional_materials (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id      INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  material_type  TEXT NOT NULL DEFAULT 'lesson_plan' CHECK (material_type IN ('lesson_plan','weekly_plan','module','slides','handout','learning_resource','activity','other')),
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_use','archived')),
  event_date     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);

CREATE TABLE assessments (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id        INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  assessment_type  TEXT NOT NULL DEFAULT 'quiz' CHECK (assessment_type IN ('quiz','exam','midterm','final','project','performance_task','assignment','other')),
  scheduled_date   TEXT,
  total_points     REAL,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','administered','graded')),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at       TEXT
);

CREATE TABLE tables_of_specifications (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assessment_id  INTEGER REFERENCES assessments(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  content_json   TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);

CREATE TABLE rubrics (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id      INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  assessment_id  INTEGER REFERENCES assessments(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  criteria_json  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);

-- ───────────────────────── Research ─────────────────────────
CREATE TABLE research_projects (
  id                  INTEGER PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  role                TEXT,
  status              TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea','proposal','approved','data_collection','analysis','writing','completed','discontinued')),
  start_date          TEXT,
  end_date            TEXT,
  research_questions  TEXT,
  objectives          TEXT,
  methodology         TEXT,
  instruments         TEXT,
  ethics_reference    TEXT,
  collaborators       TEXT,
  funding             TEXT,
  verification        TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at          TEXT
);

CREATE TABLE publications (
  id                   INTEGER PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  research_project_id  INTEGER REFERENCES research_projects(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  authors              TEXT NOT NULL,
  publication_type     TEXT NOT NULL DEFAULT 'journal_article' CHECK (publication_type IN ('journal_article','book','book_chapter','conference_paper','report','thesis','other')),
  venue                TEXT,
  publisher            TEXT,
  volume               TEXT,
  issue                TEXT,
  pages                TEXT,
  publication_date     TEXT,
  doi                  TEXT,
  url                  TEXT,
  status               TEXT NOT NULL DEFAULT 'in_preparation' CHECK (status IN ('in_preparation','submitted','under_review','accepted','published')),
  indexing             TEXT,              -- only record indexing the user has verified
  verification         TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  notes                TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at           TEXT
);
CREATE UNIQUE INDEX uq_publication_doi ON publications(user_id, lower(doi)) WHERE doi IS NOT NULL AND doi <> '' AND deleted_at IS NULL;

CREATE TABLE conference_presentations (
  id                   INTEGER PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  research_project_id  INTEGER REFERENCES research_projects(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  authors              TEXT,
  conference           TEXT NOT NULL,
  location             TEXT,
  presentation_date    TEXT,
  presentation_type    TEXT NOT NULL DEFAULT 'oral' CHECK (presentation_type IN ('oral','poster','keynote','panel','workshop','other')),
  verification         TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  notes                TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at           TEXT
);

-- ───────────────────────── Extension ─────────────────────────
CREATE TABLE extension_projects (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  project_type   TEXT NOT NULL DEFAULT 'extension_project' CHECK (project_type IN ('extension_project','community_program','training_conducted','seminar','engagement','other')),
  partner        TEXT,
  location       TEXT,
  start_date     TEXT,
  end_date       TEXT,
  status         TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','ongoing','completed','cancelled')),
  beneficiaries  TEXT,
  objectives     TEXT,
  outcomes       TEXT,
  narrative      TEXT,
  verification   TEXT NOT NULL DEFAULT 'self_reported' CHECK (verification IN ('self_reported','user_confirmed','evidence_verified')),
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);

-- ───────────────────────── Curriculum Vitae ─────────────────────────
CREATE TABLE cv_templates (
  id           INTEGER PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  ats_safe     INTEGER NOT NULL DEFAULT 0,
  config_json  TEXT
);

CREATE TABLE cv_profiles (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  cv_type         TEXT NOT NULL DEFAULT 'academic' CHECK (cv_type IN ('academic','professional','faculty','research','administrative','short_bio','application')),
  template_id     INTEGER REFERENCES cv_templates(id),
  photo_image_id  INTEGER REFERENCES uploaded_images(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  settings_json   TEXT,
  finalized_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);

CREATE TABLE cv_sections (
  id             INTEGER PRIMARY KEY,
  cv_profile_id  INTEGER NOT NULL REFERENCES cv_profiles(id) ON DELETE CASCADE,
  section_key    TEXT NOT NULL,
  heading        TEXT NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  visible        INTEGER NOT NULL DEFAULT 1,
  is_custom      INTEGER NOT NULL DEFAULT 0
);

-- CV entries reference portfolio rows (source_type/source_id) instead of copying them.
CREATE TABLE cv_entries (
  id                   INTEGER PRIMARY KEY,
  cv_section_id        INTEGER NOT NULL REFERENCES cv_sections(id) ON DELETE CASCADE,
  source_type          TEXT,
  source_id            INTEGER,
  custom_content_json  TEXT,               -- manual overrides / custom-section content
  sort_order           INTEGER NOT NULL DEFAULT 0,
  included             INTEGER NOT NULL DEFAULT 1,
  UNIQUE (cv_section_id, source_type, source_id)
);

CREATE TABLE cv_exports (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cv_profile_id  INTEGER NOT NULL REFERENCES cv_profiles(id) ON DELETE CASCADE,
  format         TEXT NOT NULL CHECK (format IN ('docx','pdf','docx_ats','pdf_ats')),
  file_name      TEXT NOT NULL,
  file_path      TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ───────────────────────── Activity, admin, tasks, reports ─────────────────────────
CREATE TABLE activities (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('activity','idea','research_note','accomplishment','meeting')),
  title       TEXT NOT NULL,
  body        TEXT,
  event_date  TEXT,
  module      TEXT NOT NULL DEFAULT 'general' CHECK (module IN ('general','teaching','research','extension','development','portfolio','admin')),
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','quick_capture')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at  TEXT
);

CREATE TABLE administrative_transactions (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('incoming','outgoing')),
  reference_no    TEXT,
  subject         TEXT NOT NULL,
  counterpart     TEXT,                    -- sender (incoming) or recipient (outgoing)
  office          TEXT,
  document_date   TEXT,
  logged_date     TEXT,
  due_date        TEXT,
  status          TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','routed','in_progress','for_follow_up','completed','archived')),
  routing_json    TEXT,
  remarks         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);

CREATE TABLE tasks (
  id                  INTEGER PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  notes               TEXT,
  due_date            TEXT,
  is_deadline         INTEGER NOT NULL DEFAULT 0,
  priority            TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
  module              TEXT NOT NULL DEFAULT 'general' CHECK (module IN ('general','teaching','research','extension','development','portfolio','cv','admin')),
  linked_entity_type  TEXT,
  linked_entity_id    INTEGER,
  completed_at        TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at          TEXT
);
CREATE INDEX idx_tasks_due ON tasks(user_id, status, due_date);

CREATE TABLE reports (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_type   TEXT NOT NULL,
  title         TEXT NOT NULL,
  period_start  TEXT,
  period_end    TEXT,
  format        TEXT CHECK (format IN ('docx','pdf','xlsx','csv')),
  file_path     TEXT,
  params_json   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ───────────────────────── Audit & search ─────────────────────────
CREATE TABLE audit_logs (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  entity_type   TEXT NOT NULL,
  entity_id     INTEGER,
  action        TEXT NOT NULL CHECK (action IN ('create','update','delete','restore','purge','login','logout','export','settings')),
  summary       TEXT,
  changes_json  TEXT,                      -- { field: [before, after] } — also serves as version history
  at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user_at ON audit_logs(user_id, at);

CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  user_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- ───────────────────────── Seed: CV templates (rendered in Phase 3) ─────────────────────────
INSERT INTO cv_templates (key, name, description, ats_safe) VALUES
  ('harvard_academic',   'Harvard-Inspired Academic CV', 'Traditional academic typography, black and white, detailed research and publication sections. Inspired by Harvard-style faculty CV conventions; not an official Harvard template.', 0),
  ('traditional_academic','Traditional Academic CV',     'Conservative serif layout with reverse-chronological entries.', 1),
  ('modern_faculty',     'Modern Academic CV',           'Contemporary layout, restrained accent colour, suited to faculty applications.', 0),
  ('research',           'Research and Publication CV',  'Leads with research experience, publications, projects and presentations.', 0),
  ('faculty_teaching',   'Faculty and Teaching CV',      'Leads with education, teaching appointments, courses handled and instructional development.', 0),
  ('comprehensive',      'Comprehensive Professional CV','Academic, administrative, research and institutional experience for promotion documentation.', 0),
  ('minimal_ats',        'Minimalist ATS CV',            'Single column, standard headings, no graphics — built for applicant tracking systems.', 1);
