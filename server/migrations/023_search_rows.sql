-- The full-text index cannot look rows up by entity (FTS5 columns are not indexed), so replacing one
-- entry scanned the whole index on every save. This table maps each entity to its index row.
DELETE FROM search_index WHERE rowid NOT IN (SELECT MAX(rowid) FROM search_index GROUP BY entity_type, entity_id);
CREATE TABLE search_rows (
  entity_type TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  fts_rowid   INTEGER NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
) WITHOUT ROWID;
INSERT INTO search_rows (entity_type, entity_id, fts_rowid)
  SELECT entity_type, CAST(entity_id AS INTEGER), rowid FROM search_index;
