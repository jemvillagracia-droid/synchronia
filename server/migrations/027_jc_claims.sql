-- DBM-CHED JC No. 01 s. 2026 (Enhanced IG of JC No. 3 s. 2022) credentials checklist: which portfolio records the
-- faculty member claims under which indicator. The catalogue of indicators lives in server/src/portfolio/jc.js.
CREATE TABLE jc_claims (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  indicator   TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  quantity    REAL NOT NULL DEFAULT 1,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'planned')),
  docs_json   TEXT,                       -- { "<index of the indicator's required document>": "secured" | "missing" | "pending" | "na" }
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, indicator, entity_type, entity_id)
);
CREATE INDEX idx_jc_claims_user ON jc_claims(user_id, indicator);
