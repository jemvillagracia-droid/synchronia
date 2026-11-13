-- Phase 3 — Curriculum Vitae Studio

-- Versions: CVs in one family share family_id; finalized versions are frozen as a snapshot of the composed document,
-- so later portfolio edits never alter a finalized CV.
ALTER TABLE cv_profiles ADD COLUMN family_id INTEGER;
ALTER TABLE cv_profiles ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cv_profiles ADD COLUMN snapshot_json TEXT;
ALTER TABLE cv_profiles ADD COLUMN approval_json TEXT;   -- quality checklist acknowledged at approval
UPDATE cv_profiles SET family_id = id WHERE family_id IS NULL;

-- Section options: page breaks, ordering mode (auto by date / manual)
ALTER TABLE cv_sections ADD COLUMN settings_json TEXT;

-- Export history details
ALTER TABLE cv_exports ADD COLUMN size_bytes INTEGER;
ALTER TABLE cv_exports ADD COLUMN cv_version INTEGER;
ALTER TABLE cv_exports ADD COLUMN cv_status TEXT;

-- Photo library labels / default
ALTER TABLE uploaded_images ADD COLUMN original_ext TEXT;

CREATE INDEX IF NOT EXISTS idx_cv_sections_profile ON cv_sections(cv_profile_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cv_entries_section ON cv_entries(cv_section_id, sort_order);
