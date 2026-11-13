-- Phase 2 — Professional Portfolio
-- Accomplishments captured in Phase 1 lived in `activities`. They now belong to the portfolio, so move them into
-- `portfolio_entries` (keeping their event and record dates) and retire the originals into the recycle bin.

INSERT INTO portfolio_entries (user_id, category, title, description, event_date, verification, created_at, updated_at)
SELECT user_id, 'accomplishment', title, body, event_date, 'self_reported', created_at, created_at
FROM activities
WHERE kind = 'accomplishment' AND deleted_at IS NULL;

INSERT INTO audit_logs (user_id, entity_type, entity_id, action, summary)
SELECT user_id, 'activities', id, 'delete', 'Moved captured accomplishment into the Professional Portfolio: ' || title
FROM activities
WHERE kind = 'accomplishment' AND deleted_at IS NULL;

UPDATE activities SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE kind = 'accomplishment' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_user_entity ON evidence_links(user_id, entity_type, entity_id);
