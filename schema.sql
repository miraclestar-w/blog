CREATE TABLE IF NOT EXISTS posts (
  slug TEXT PRIMARY KEY,
  title TEXT,
  date TEXT,
  description TEXT,
  category TEXT,
  content TEXT
);
CREATE TABLE IF NOT EXISTS daily (
  filename TEXT PRIMARY KEY,
  date TEXT,
  content TEXT,
  image_url TEXT
);
CREATE TABLE IF NOT EXISTS moments (
  filename TEXT PRIMARY KEY,
  title TEXT,
  date TEXT,
  image_url TEXT,
  content TEXT
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT,
  nickname TEXT,
  contact TEXT,
  content TEXT,
  parent_id TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);
CREATE TABLE IF NOT EXISTS rate_limits (
  ip_address TEXT PRIMARY KEY,
  last_comment_at INTEGER
);
