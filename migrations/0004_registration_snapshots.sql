-- Latest content from the owner's installations; no images or account identifiers.
CREATE TABLE registration_snapshots (
 id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL,
 platform TEXT NOT NULL,
 subscriber_id TEXT,
 data TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX registration_snapshots_updated ON registration_snapshots(updated_at);
