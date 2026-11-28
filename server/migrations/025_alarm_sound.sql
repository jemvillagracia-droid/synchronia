-- System Timer alarm: the original battle march (looping until you respond) or simple beeps, and its volume.
ALTER TABLE user_profiles ADD COLUMN alarm_style TEXT NOT NULL DEFAULT 'battle';
ALTER TABLE user_profiles ADD COLUMN alarm_volume INTEGER NOT NULL DEFAULT 70;
