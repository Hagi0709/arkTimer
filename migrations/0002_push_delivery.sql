-- Additive migration: keep existing subscriptions, alerts and sent_at history.
ALTER TABLE subscribers ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscribers ADD COLUMN invalidated_at INTEGER;
ALTER TABLE alerts ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alerts ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alerts ADD COLUMN lease_until INTEGER;
ALTER TABLE alerts ADD COLUMN lease_token TEXT;
ALTER TABLE alerts ADD COLUMN last_attempt_at INTEGER;
ALTER TABLE alerts ADD COLUMN last_status INTEGER;
ALTER TABLE alerts ADD COLUMN last_error TEXT;
ALTER TABLE alerts ADD COLUMN failed_at INTEGER;
ALTER TABLE alerts ADD COLUMN cancelled_at INTEGER;
ALTER TABLE alerts ADD COLUMN expires_at INTEGER;
ALTER TABLE alerts ADD COLUMN displayed_at INTEGER;
UPDATE alerts SET expires_at = due_at + 86400000 WHERE expires_at IS NULL;
CREATE INDEX IF NOT EXISTS alerts_pending_due ON alerts(due_at, next_attempt_at)
  WHERE sent_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS alerts_subscriber ON alerts(subscriber_id);
