-- Owner preference: paper size for exported documents (Settings › Document export).
ALTER TABLE user_profiles ADD COLUMN paper_size TEXT NOT NULL DEFAULT 'letter';
