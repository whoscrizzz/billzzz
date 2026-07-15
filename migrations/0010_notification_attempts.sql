-- Per-push-attempt delivery log, so a "notification health" indicator can
-- actually surface real send outcomes — notification_log only records
-- successful sends for dedup purposes, and logError (console.error) never
-- reaches D1, so neither can answer "are pushes actually getting through".
CREATE TABLE IF NOT EXISTS notification_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'expired')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notification_attempts_user ON notification_attempts(user_id, created_at);
