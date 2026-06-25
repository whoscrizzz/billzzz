-- User preferences
ALTER TABLE users ADD COLUMN budget_limit REAL;
ALTER TABLE users ADD COLUMN email_reminders INTEGER NOT NULL DEFAULT 0;

-- Subscription extras
ALTER TABLE subscriptions ADD COLUMN notify_hour INTEGER NOT NULL DEFAULT 9;
ALTER TABLE subscriptions ADD COLUMN snoozed_until TEXT;

-- Backfill due_date for recurring subs missing it
UPDATE subscriptions
SET due_date = printf(
  '%04d-%02d-%02d',
  CAST(strftime('%Y', created_at) AS INTEGER),
  CAST(strftime('%m', created_at) AS INTEGER),
  CASE WHEN due_day > 28 THEN 28 ELSE due_day END
)
WHERE due_date IS NULL AND frequency != 'once' AND deleted_at IS NULL;

-- Rate limiting for auth
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);
