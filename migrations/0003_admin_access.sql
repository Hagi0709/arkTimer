-- Separate management access from existing notification subscriptions and history.
CREATE TABLE admin_sessions (
 id TEXT PRIMARY KEY,
 expires_at INTEGER NOT NULL
);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE admin_login_limits (
 id TEXT PRIMARY KEY,
 window_start INTEGER NOT NULL,
 attempts INTEGER NOT NULL
);
