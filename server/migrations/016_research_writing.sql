-- Research writing: recovery points for document sections (kept while writing, as for syllabi), and the link from a
-- captured idea (Quick Capture) to the research project developed from it.
CREATE TABLE research_section_versions (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id  INTEGER NOT NULL REFERENCES research_sections(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  words       INTEGER NOT NULL DEFAULT 0,
  reason      TEXT NOT NULL DEFAULT 'autosave',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_section_versions ON research_section_versions(section_id, created_at);

ALTER TABLE activities ADD COLUMN developed_into_project_id INTEGER REFERENCES research_projects(id) ON DELETE SET NULL;
