-- D1 Migration 0001: XPIDER Authoritative Unsubscribe & Suppression Store
CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
  token_hash TEXT PRIMARY KEY,
  recipient_hash TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_recipient_hash
  ON unsubscribe_tokens (recipient_hash);

CREATE TABLE IF NOT EXISTS suppressions (
  recipient_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT 'UNSUBSCRIBED',
  source_token_hash TEXT,
  suppressed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_suppressions_updated_at
  ON suppressions (updated_at);

CREATE TABLE IF NOT EXISTS unsubscribe_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  token_hash TEXT,
  recipient_hash TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
