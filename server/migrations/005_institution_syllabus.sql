-- Institution profile (for letterheads, syllabi and signatories) and the URS OBE syllabus format.

CREATE TABLE institution_settings (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data_json   TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

ALTER TABLE courses ADD COLUMN contact_hours INTEGER;
ALTER TABLE learning_outcomes ADD COLUMN group_label TEXT;

-- URS legend: I = Introductory, P = Practiced, D = Demonstrative ("Enhanced" maps to "Practiced").
UPDATE outcome_alignments SET level = 'P' WHERE level = 'E';
