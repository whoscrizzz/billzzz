-- Session/device management: per-session id (distinct from the token, which
-- is the bearer credential and must never be returned to the client for
-- another session), plus device/IP info captured at login time.
ALTER TABLE sessions ADD COLUMN id TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN ip TEXT;
ALTER TABLE sessions ADD COLUMN device_name TEXT;

UPDATE sessions SET id = lower(hex(randomblob(16))) WHERE id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_id ON sessions(id);
