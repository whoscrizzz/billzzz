-- One-off payments, payment log, extend frequency
ALTER TABLE subscriptions ADD COLUMN due_date TEXT;
ALTER TABLE subscriptions ADD COLUMN last_paid_at TEXT;

CREATE TABLE IF NOT EXISTS payment_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  subscription_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  paid_at TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payment_records_sub ON payment_records(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_user ON payment_records(user_id);

CREATE TABLE subscriptions_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  due_day INTEGER NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 31),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly', 'once')),
  due_date TEXT,
  category TEXT,
  notes TEXT,
  notify_days_before INTEGER NOT NULL DEFAULT 3,
  last_paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

INSERT INTO subscriptions_new (
  id, user_id, name, amount, currency, due_day, frequency, due_date,
  category, notes, notify_days_before, last_paid_at, created_at, updated_at, deleted_at
)
SELECT
  id, user_id, name, amount, currency, due_day, frequency, due_date,
  category, notes, notify_days_before, last_paid_at, created_at, updated_at, deleted_at
FROM subscriptions;

DROP TABLE subscriptions;
ALTER TABLE subscriptions_new RENAME TO subscriptions;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_due ON subscriptions(user_id, due_day);
