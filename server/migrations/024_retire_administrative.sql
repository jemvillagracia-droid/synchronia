-- Administrative Operations is retired (1.5.0); SYNCHRONIA now centres on teaching.
-- Nothing is deleted: correspondence, document routing, secretariat records, the office log and turnover
-- documents stay in the database file (and in backups and the portable export). They are only hidden.
UPDATE tasks SET module = 'general' WHERE module = 'admin';
UPDATE activities SET module = 'general' WHERE module = 'admin';
UPDATE user_profiles SET academic_mode = 'instructor' WHERE academic_mode = 'administrative';
DELETE FROM search_index WHERE rowid IN (SELECT fts_rowid FROM search_rows
  WHERE entity_type IN ('correspondence', 'secretariat_records', 'daily_logs', 'turnover_documents'));
DELETE FROM search_rows WHERE entity_type IN ('correspondence', 'secretariat_records', 'daily_logs', 'turnover_documents');
