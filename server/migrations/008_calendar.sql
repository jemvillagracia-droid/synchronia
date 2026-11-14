-- Calendar: which holiday calendars to show, and the owner's corrections (proclaimed dates, one-off declarations).

CREATE TABLE calendar_settings (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  show_ph      INTEGER NOT NULL DEFAULT 1,
  show_au      INTEGER NOT NULL DEFAULT 0,
  au_state     TEXT NOT NULL DEFAULT 'VIC' CHECK (au_state IN ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA')),
  week_start   INTEGER NOT NULL DEFAULT 0 CHECK (week_start IN (0, 1)),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE holiday_overrides (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region      TEXT NOT NULL CHECK (region IN ('PH','AU')),
  date        TEXT NOT NULL,
  name        TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('add','remove')),
  holiday_type TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_holiday_overrides ON holiday_overrides(user_id, region, date);
