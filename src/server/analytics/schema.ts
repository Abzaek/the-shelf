/** Additive migration. Existing history is never manufactured. */
export const analyticsMigration = `
CREATE TABLE analytics_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO analytics_meta VALUES ('started_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
CREATE TABLE analytics_users (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_activity TEXT, first_activity TEXT, first_upload TEXT, first_open TEXT,
  first_read TEXT, return_read TEXT, first_completion TEXT, completed_after_return TEXT,
  session_started TEXT, session_seen TEXT, reading_id TEXT, reading_book TEXT, reading_seen TEXT,
  last_read_at TEXT, pulse_sequence INTEGER NOT NULL DEFAULT 0, pulse_page INTEGER NOT NULL DEFAULT 1,
  first_read_session TEXT
);
CREATE TABLE analytics_daily_users (
  day TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sessions INTEGER NOT NULL DEFAULT 0, session_seconds INTEGER NOT NULL DEFAULT 0,
  reading_sessions INTEGER NOT NULL DEFAULT 0, reading_seconds INTEGER NOT NULL DEFAULT 0,
  pages INTEGER NOT NULL DEFAULT 0, locations INTEGER NOT NULL DEFAULT 0,
  opens INTEGER NOT NULL DEFAULT 0, uploads INTEGER NOT NULL DEFAULT 0, completions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, user_id)
);
CREATE INDEX analytics_daily_users_user ON analytics_daily_users(user_id, day);
CREATE TABLE analytics_book_state (
  book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE, first_open TEXT NOT NULL
);
CREATE TABLE analytics_daily_books (
  day TEXT NOT NULL, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  opens INTEGER NOT NULL DEFAULT 0, sessions INTEGER NOT NULL DEFAULT 0, seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, book_id)
);
CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT, kind TEXT NOT NULL, at TEXT NOT NULL, label TEXT NOT NULL DEFAULT ''
);
CREATE INDEX analytics_events_user ON analytics_events(user_id, at DESC);
CREATE INDEX analytics_events_at ON analytics_events(at);
CREATE TABLE analytics_storage_daily (
  day TEXT PRIMARY KEY, added_bytes INTEGER NOT NULL DEFAULT 0, removed_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_books INTEGER NOT NULL DEFAULT 0, used_bytes INTEGER, book_count INTEGER, measured_at TEXT
);
`;
