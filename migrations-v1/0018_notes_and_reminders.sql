-- Notas y recordatorios: port de Notes+ (app standalone separada) como panel
-- dentro de bills-pwa. Categoría es texto libre (no un enum fijo) para poder
-- reusar categoryColor() en vez de un segundo sistema de color.
-- `notified_at` en reminders es el claim de dedup del cron de push — se
-- reclama con `UPDATE ... WHERE notified_at IS NULL`, mismo principio que
-- notification_log pero sin su composite key (los recordatorios no son
-- recurrentes, no hay "próxima ocurrencia" que distinguir).
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  category TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, updated_at);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  due_at TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, due_at);
