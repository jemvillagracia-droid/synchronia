-- Research Development Workspace. research_projects stays the one authoritative project record; everything below
-- links to it. Publications and conference presentations remain the portfolio/CV records of what was disseminated.

-- Project: a customizable stage (the fixed `status` is derived from it for analytics and the CV), idea fields,
-- and archiving (archived projects leave the dashboard but are never deleted).
ALTER TABLE research_projects ADD COLUMN stage TEXT;
ALTER TABLE research_projects ADD COLUMN research_area TEXT;
ALTER TABLE research_projects ADD COLUMN tags TEXT;
ALTER TABLE research_projects ADD COLUMN problem TEXT;
ALTER TABLE research_projects ADD COLUMN significance TEXT;
ALTER TABLE research_projects ADD COLUMN variables TEXT;
ALTER TABLE research_projects ADD COLUMN population TEXT;
ALTER TABLE research_projects ADD COLUMN theory TEXT;
ALTER TABLE research_projects ADD COLUMN archived_at TEXT;
UPDATE research_projects SET stage = CASE status
  WHEN 'idea' THEN 'idea' WHEN 'proposal' THEN 'proposal' WHEN 'approved' THEN 'ethics'
  WHEN 'data_collection' THEN 'data_collection' WHEN 'analysis' THEN 'manuscript' WHEN 'writing' THEN 'manuscript'
  WHEN 'completed' THEN 'completed' WHEN 'discontinued' THEN 'discontinued' END;
CREATE INDEX ix_research_projects_user_stage ON research_projects(user_id, deleted_at, archived_at, stage);

-- Per-user research preferences: the stage list (null = defaults) and dismissed task suggestions.
CREATE TABLE research_settings (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stages_json     TEXT,
  dismissed_json  TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE research_milestones (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    INTEGER NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  stage         TEXT,
  due_date      TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped')),
  completed_on  TEXT,
  notes         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);
CREATE INDEX ix_research_milestones_project ON research_milestones(project_id, deleted_at);
CREATE INDEX ix_research_milestones_due ON research_milestones(user_id, deleted_at, status, due_date);

-- Proposals, concept papers, methodology documents and manuscripts: one document model with sections.
CREATE TABLE research_documents (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    INTEGER REFERENCES research_projects(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('proposal','concept_paper','methodology','manuscript','other')),
  title         TEXT NOT NULL,
  target        TEXT,
  requirements  TEXT,
  word_limit    INTEGER CHECK (word_limit IS NULL OR word_limit > 0),
  status        TEXT NOT NULL DEFAULT 'drafting' CHECK (status IN ('drafting','for_review','revising','final')),
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);
CREATE INDEX ix_research_documents_project ON research_documents(user_id, deleted_at, project_id);

CREATE TABLE research_sections (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id   INTEGER NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
  section_key   TEXT,
  heading       TEXT NOT NULL,
  body          TEXT,
  status        TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','drafting','complete','not_applicable')),
  notes         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);
CREATE INDEX ix_research_sections_document ON research_sections(document_id, deleted_at, sort_order);

-- Literature: bibliographic records with review fields. The documents themselves stay in Google Drive or the
-- library and are attached through the usual evidence links.
CREATE TABLE literature (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type     TEXT NOT NULL DEFAULT 'journal_article' CHECK (item_type IN ('journal_article','book','book_chapter','conference_paper','thesis','report','web','other')),
  title         TEXT NOT NULL,
  authors       TEXT,
  year          TEXT,
  source        TEXT,
  volume        TEXT,
  issue         TEXT,
  pages         TEXT,
  publisher     TEXT,
  doi           TEXT,
  url           TEXT,
  abstract      TEXT,
  objectives    TEXT,
  methodology   TEXT,
  findings      TEXT,
  limitations   TEXT,
  relevance     TEXT,
  citations     TEXT,
  notes         TEXT,
  theme         TEXT,
  tags          TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);
CREATE UNIQUE INDEX uq_literature_doi ON literature(user_id, lower(doi)) WHERE doi IS NOT NULL AND doi <> '' AND deleted_at IS NULL;
CREATE INDEX ix_literature_user ON literature(user_id, deleted_at, year);

CREATE TABLE research_project_literature (
  project_id     INTEGER NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  literature_id  INTEGER NOT NULL REFERENCES literature(id) ON DELETE CASCADE,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (project_id, literature_id)
);
CREATE INDEX ix_rpl_literature ON research_project_literature(literature_id);

-- Instrument laboratory: Initial → Expert review → Revision → Final, every version kept. No statistics.
CREATE TABLE research_instruments (
  id                 INTEGER PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  origin             TEXT NOT NULL DEFAULT 'developed' CHECK (origin IN ('developed','adopted','adapted')),
  source             TEXT,
  permission_status  TEXT CHECK (permission_status IS NULL OR permission_status IN ('not_needed','to_request','requested','granted','declined')),
  permission_notes   TEXT,
  stage              TEXT NOT NULL DEFAULT 'initial' CHECK (stage IN ('initial','expert_review','revision','final')),
  purpose            TEXT,
  external_results   TEXT,
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at         TEXT
);

CREATE TABLE research_instrument_projects (
  instrument_id  INTEGER NOT NULL REFERENCES research_instruments(id) ON DELETE CASCADE,
  project_id     INTEGER NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (instrument_id, project_id)
);
CREATE INDEX ix_rip_project ON research_instrument_projects(project_id);

CREATE TABLE instrument_versions (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_id    INTEGER NOT NULL REFERENCES research_instruments(id) ON DELETE CASCADE,
  version_no       INTEGER NOT NULL,
  label            TEXT,
  stage            TEXT NOT NULL DEFAULT 'initial' CHECK (stage IN ('initial','expert_review','revision','final')),
  instructions     TEXT,
  response_scale   TEXT,
  scoring          TEXT,
  interpretation   TEXT,
  structure_json   TEXT,
  change_notes     TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at       TEXT,
  UNIQUE (instrument_id, version_no)
);

CREATE TABLE instrument_reviews (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_id   INTEGER NOT NULL REFERENCES research_instruments(id) ON DELETE CASCADE,
  version_id      INTEGER REFERENCES instrument_versions(id) ON DELETE SET NULL,
  validator       TEXT NOT NULL,
  credentials     TEXT,
  review_date     TEXT,
  recommendation  TEXT CHECK (recommendation IS NULL OR recommendation IN ('accept','minor_revision','major_revision','reject')),
  rating          TEXT,
  comments        TEXT,
  addressed       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);

CREATE TABLE ethics_reviews (
  id                  INTEGER PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id          INTEGER NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  committee           TEXT,
  status              TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','submitted','under_review','revisions_required','approved','approved_with_conditions','exempt','rejected','expired')),
  submission_date     TEXT,
  approval_date       TEXT,
  reference_no        TEXT,
  required_revisions  TEXT,
  revisions_due       TEXT,
  conditions          TEXT,
  expiry_date         TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at          TEXT
);
CREATE INDEX ix_ethics_project ON ethics_reviews(project_id, deleted_at);

-- Submissions to journals and conferences. On acceptance or publication, "Record in portfolio" fills the existing
-- publication or presentation record, so nothing is typed twice.
CREATE TABLE research_submissions (
  id                 INTEGER PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id         INTEGER REFERENCES research_projects(id) ON DELETE SET NULL,
  document_id        INTEGER REFERENCES research_documents(id) ON DELETE SET NULL,
  kind               TEXT NOT NULL DEFAULT 'journal' CHECK (kind IN ('journal','conference','book','other')),
  title              TEXT NOT NULL,
  venue              TEXT,
  status             TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_preparation','submitted','under_review','revision_required','accepted','published','presented','rejected','withdrawn')),
  submission_date    TEXT,
  revision_due       TEXT,
  resubmission_date  TEXT,
  acceptance_date    TEXT,
  publication_date   TEXT,
  doi                TEXT,
  url                TEXT,
  revision_requests  TEXT,
  conference_details TEXT,
  notes              TEXT,
  publication_id     INTEGER REFERENCES publications(id) ON DELETE SET NULL,
  presentation_id    INTEGER REFERENCES conference_presentations(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at         TEXT
);
CREATE INDEX ix_submissions_project ON research_submissions(user_id, deleted_at, project_id);

CREATE TABLE research_funding (
  id                 INTEGER PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id         INTEGER NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  opportunity        TEXT NOT NULL,
  organization       TEXT,
  deadline           TEXT,
  submission_status  TEXT NOT NULL DEFAULT 'planned' CHECK (submission_status IN ('planned','preparing','submitted','not_submitted')),
  award_status       TEXT CHECK (award_status IS NULL OR award_status IN ('pending','awarded','not_awarded','withdrawn')),
  amount             REAL CHECK (amount IS NULL OR amount >= 0),
  currency           TEXT,
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at         TEXT
);

CREATE TABLE research_collaborators (
  id                   INTEGER PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id           INTEGER NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  affiliation          TEXT,
  project_role         TEXT,
  responsibilities     TEXT,
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','completed','inactive')),
  communication_notes  TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at           TEXT
);
