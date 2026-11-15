-- Owner preference: colour theme (default: the violet scheme).
ALTER TABLE user_profiles ADD COLUMN theme TEXT NOT NULL DEFAULT 'violet';
