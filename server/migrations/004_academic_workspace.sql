-- Phase 4 — Academic Workspace, plus fields the Harvard-style CV layout needs.

-- Harvard-style entries: organization + location on the first line; thesis and advisor under degrees.
ALTER TABLE education_records ADD COLUMN thesis_title TEXT;
ALTER TABLE education_records ADD COLUMN advisor TEXT;
ALTER TABLE employment_records ADD COLUMN location TEXT;
ALTER TABLE academic_appointments ADD COLUMN location TEXT;

-- Teaching: lesson plans and materials tied to an offering and week; outcomes they address.
ALTER TABLE instructional_materials ADD COLUMN teaching_assignment_id INTEGER REFERENCES teaching_assignments(id) ON DELETE SET NULL;
ALTER TABLE instructional_materials ADD COLUMN week_no INTEGER;
ALTER TABLE instructional_materials ADD COLUMN clo_codes TEXT;
ALTER TABLE instructional_materials ADD COLUMN content_json TEXT;

ALTER TABLE assessments ADD COLUMN teaching_assignment_id INTEGER REFERENCES teaching_assignments(id) ON DELETE SET NULL;
ALTER TABLE assessments ADD COLUMN clo_codes TEXT;
ALTER TABLE assessments ADD COLUMN item_count INTEGER;

ALTER TABLE learning_outcomes ADD COLUMN program TEXT;

-- Class activity records (with attendance) per offering
CREATE TABLE class_activities (
  id                      INTEGER PRIMARY KEY,
  user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teaching_assignment_id  INTEGER NOT NULL REFERENCES teaching_assignments(id) ON DELETE CASCADE,
  activity_date           TEXT NOT NULL,
  title                   TEXT NOT NULL,
  activity_type           TEXT NOT NULL DEFAULT 'lecture' CHECK (activity_type IN ('lecture','laboratory','activity','assessment','consultation','field_work','other')),
  description             TEXT,
  present                 INTEGER CHECK (present IS NULL OR present >= 0),
  enrolled                INTEGER CHECK (enrolled IS NULL OR enrolled >= 0),
  notes                   TEXT,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at              TEXT
);
CREATE INDEX idx_class_activities_offering ON class_activities(teaching_assignment_id, activity_date);

-- Research progress tracking
ALTER TABLE research_projects ADD COLUMN progress_pct INTEGER CHECK (progress_pct IS NULL OR (progress_pct BETWEEN 0 AND 100));
ALTER TABLE research_projects ADD COLUMN target_sample INTEGER;
ALTER TABLE research_projects ADD COLUMN collected_sample INTEGER;
ALTER TABLE research_projects ADD COLUMN validation_status TEXT CHECK (validation_status IS NULL OR validation_status IN ('not_started','in_progress','validated','not_applicable'));
ALTER TABLE research_projects ADD COLUMN ethics_status TEXT CHECK (ethics_status IS NULL OR ethics_status IN ('not_required','to_submit','under_review','approved','revisions_requested'));

-- Extension reporting figures
ALTER TABLE extension_projects ADD COLUMN participants_count INTEGER CHECK (participants_count IS NULL OR participants_count >= 0);
ALTER TABLE extension_projects ADD COLUMN training_hours REAL CHECK (training_hours IS NULL OR training_hours >= 0);
ALTER TABLE extension_projects ADD COLUMN role TEXT;

-- Faculty development goals
CREATE TABLE development_goals (
  id                  INTEGER PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_area           TEXT NOT NULL DEFAULT 'teaching' CHECK (goal_area IN ('teaching','research','extension','professional','qualification')),
  title               TEXT NOT NULL,
  description         TEXT,
  target_date         TEXT,
  status              TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','achieved','deferred')),
  progress_pct        INTEGER CHECK (progress_pct IS NULL OR (progress_pct BETWEEN 0 AND 100)),
  linked_training_id  INTEGER REFERENCES training_records(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at          TEXT
);
