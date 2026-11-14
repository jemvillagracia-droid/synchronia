-- Owner preference: turn off non-essential motion (the operating system's reduced-motion setting is also respected).
ALTER TABLE user_profiles ADD COLUMN reduce_motion INTEGER NOT NULL DEFAULT 0;
