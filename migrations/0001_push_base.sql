-- Existing installations already have these tables. Never recreate or clear them.
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  subscription TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  due_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at INTEGER
);
