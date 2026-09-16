/** Migration 6: community is deliberately separate from private library replication. */
export const communityMigration = `
CREATE TABLE community_members (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  alias TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('invited','active','suspended','left')),
  joined_at TEXT,
  invited_at TEXT NOT NULL
);
CREATE UNIQUE INDEX community_alias ON community_members(alias COLLATE NOCASE) WHERE alias <> '';
CREATE TABLE community_rooms (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, book_title TEXT NOT NULL,
  author TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE community_posts (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES community_rooms(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT NOT NULL,
  spoiler INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0, removed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX community_posts_room ON community_posts(room_id, parent_id, created_at, id);
CREATE INDEX community_posts_user ON community_posts(user_id, created_at);
CREATE TABLE community_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT,
  UNIQUE(post_id, reporter_id)
);
CREATE TABLE community_visits (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL, PRIMARY KEY(user_id, day)
);
`;
