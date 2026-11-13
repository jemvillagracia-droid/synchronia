-- Phase 7: Google Drive connection (optional, owner-authorized), file-reference housekeeping.

CREATE TABLE google_connections (
  user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  client_id           TEXT,
  client_secret_enc   TEXT,
  account_email       TEXT,
  account_name        TEXT,
  scopes              TEXT,
  refresh_token_enc   TEXT,
  access_token_enc    TEXT,
  access_expires_at   TEXT,
  status              TEXT NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected','connected','needs_reconnect')),
  status_detail       TEXT,
  connected_at        TEXT,
  last_used_at        TEXT,
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

ALTER TABLE external_file_references ADD COLUMN metadata_checked_at TEXT;
CREATE INDEX idx_file_refs_ident ON external_file_references(user_id, provider, external_id);
CREATE INDEX idx_file_refs_url ON external_file_references(user_id, url);
