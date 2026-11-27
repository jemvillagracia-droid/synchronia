-- Settings › Notifications: Windows notifications while SYNCHRONIA is in the background, and timer sounds.
ALTER TABLE user_profiles ADD COLUMN notify_desktop INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_profiles ADD COLUMN notify_sound INTEGER NOT NULL DEFAULT 1;
