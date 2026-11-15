-- PDS Section VII (Learning and Development interventions attended): the type of L&D for each training, and a link
-- to each year's folder of certificates (for example the year's folder in Google Drive).
ALTER TABLE training_records ADD COLUMN ld_type TEXT;
CREATE TABLE ld_year_folders (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year     INTEGER NOT NULL,
  url      TEXT NOT NULL,
  PRIMARY KEY (user_id, year)
);
