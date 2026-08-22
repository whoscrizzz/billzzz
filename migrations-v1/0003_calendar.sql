ALTER TABLE users ADD COLUMN calendar_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_calendar_token ON users(calendar_token) WHERE calendar_token IS NOT NULL;
