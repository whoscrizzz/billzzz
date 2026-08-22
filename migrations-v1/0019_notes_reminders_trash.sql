-- Papelera para notas y recordatorios, mismo patrón que
-- migrations/0013_subscription_trash.sql: columna opt-in, NULL en todo lo
-- existente, purga automática a 30 días vía scheduled() en index.ts.
ALTER TABLE notes ADD COLUMN trashed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_notes_trashed ON notes(trashed_at);

ALTER TABLE reminders ADD COLUMN trashed_at TEXT;
-- Índice compuesto: cubre tanto el filtro de papelera como la query
-- cross-user del cron de reminder-notifications.ts
-- (WHERE done=0 AND notified_at IS NULL AND due_at <= ?).
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(trashed_at, done, notified_at, due_at);
