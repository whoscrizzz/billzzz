-- Billzzz D1 v2 — baseline completo.
--
-- La línea v1 permanece en migrations/ hasta el cutover. Esta base se crea
-- desde cero: no aplicar este archivo sobre bills-pwa-db.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  budget_limit_minor INTEGER CHECK (budget_limit_minor IS NULL OR budget_limit_minor >= 0),
  budget_limit REAL GENERATED ALWAYS AS (
    CASE WHEN budget_limit_minor IS NULL THEN NULL ELSE budget_limit_minor / 100.0 END
  ) VIRTUAL,
  email_reminders INTEGER NOT NULL DEFAULT 0 CHECK (email_reminders IN (0, 1)),
  timezone TEXT NOT NULL DEFAULT 'America/Mexico_City' CHECK (length(trim(timezone)) > 0),
  action_token_version INTEGER NOT NULL DEFAULT 0 CHECK (action_token_version >= 0),
  calendar_token TEXT,
  capture_token TEXT,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  fx_usd_mxn_micros INTEGER CHECK (fx_usd_mxn_micros IS NULL OR fx_usd_mxn_micros > 0),
  fx_usd_mxn REAL GENERATED ALWAYS AS (
    CASE WHEN fx_usd_mxn_micros IS NULL THEN NULL ELSE fx_usd_mxn_micros / 1000000.0 END
  ) VIRTUAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(created_at) IS NOT NULL)
) STRICT;

CREATE UNIQUE INDEX idx_users_email
  ON users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_calendar_token
  ON users(calendar_token) WHERE calendar_token IS NOT NULL;
CREATE UNIQUE INDEX idx_users_capture_token
  ON users(capture_token) WHERE capture_token IS NOT NULL;

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  amount REAL GENERATED ALWAYS AS (amount_minor / 100.0) VIRTUAL,
  currency TEXT NOT NULL DEFAULT 'MXN' CHECK (currency IN ('MXN', 'USD')),
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  frequency TEXT NOT NULL
    CHECK (frequency IN ('weekly', 'monthly', 'yearly', 'once', 'interval')),
  due_date TEXT CHECK (
    due_date IS NULL OR (
      length(due_date) = 10 AND
      date(due_date, '+0 days') = due_date
    )
  ),
  due_dates TEXT CHECK (
    CASE
      WHEN due_dates IS NULL THEN 1
      WHEN json_valid(due_dates) = 0 THEN 0
      ELSE json_type(due_dates) = 'array'
    END
  ),
  due_days TEXT CHECK (
    CASE
      WHEN due_days IS NULL THEN 1
      WHEN json_valid(due_days) = 0 THEN 0
      ELSE json_type(due_days) = 'array'
    END
  ),
  interval_count INTEGER,
  interval_unit TEXT,
  category TEXT CHECK (category IS NULL OR length(category) <= 120),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  notify_days_before INTEGER NOT NULL DEFAULT 1 CHECK (notify_days_before BETWEEN 0 AND 365),
  notify_hour INTEGER NOT NULL DEFAULT 9 CHECK (notify_hour BETWEEN 0 AND 23),
  snoozed_until TEXT CHECK (
    snoozed_until IS NULL OR (
      length(snoozed_until) = 10 AND
      date(snoozed_until, '+0 days') = snoozed_until
    )
  ),
  last_paid_at TEXT CHECK (last_paid_at IS NULL OR unixepoch(last_paid_at) IS NOT NULL),
  deleted_at TEXT CHECK (deleted_at IS NULL OR unixepoch(deleted_at) IS NOT NULL),
  trashed_at TEXT CHECK (trashed_at IS NULL OR unixepoch(trashed_at) IS NOT NULL),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(created_at) IS NOT NULL),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(updated_at) IS NOT NULL),
  CHECK (
    (frequency = 'interval'
      AND interval_count IS NOT NULL
      AND interval_count >= 1
      AND interval_unit IS NOT NULL
      AND interval_unit IN ('day', 'week', 'month'))
    OR
    (frequency <> 'interval' AND interval_count IS NULL AND interval_unit IS NULL)
  ),
  CHECK (deleted_at IS NULL OR trashed_at IS NULL)
) STRICT;

CREATE INDEX idx_subscriptions_active_user_due
  ON subscriptions(user_id, due_day, name)
  WHERE deleted_at IS NULL AND trashed_at IS NULL;
CREATE INDEX idx_subscriptions_active_due_date
  ON subscriptions(due_date)
  WHERE deleted_at IS NULL AND trashed_at IS NULL AND due_date IS NOT NULL;
CREATE INDEX idx_subscriptions_archived_user
  ON subscriptions(user_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_subscriptions_trashed_user
  ON subscriptions(user_id, trashed_at DESC)
  WHERE trashed_at IS NOT NULL;
CREATE INDEX idx_subscriptions_trashed_at
  ON subscriptions(trashed_at) WHERE trashed_at IS NOT NULL;

CREATE TRIGGER validate_subscriptions_json_insert
BEFORE INSERT ON subscriptions
BEGIN
  SELECT CASE WHEN NEW.due_dates IS NOT NULL AND EXISTS (
    SELECT 1 FROM json_each(NEW.due_dates)
    WHERE json_type(value) <> 'object'
       OR json_type(value, '$.date') <> 'text'
       OR length(json_extract(value, '$.date')) <> 10
       OR date(json_extract(value, '$.date'), '+0 days') <> json_extract(value, '$.date')
       OR EXISTS (
         SELECT 1 FROM json_each(value) AS field
         WHERE field.key NOT IN ('date', 'amount_minor')
       )
       OR (
         json_type(value, '$.amount_minor') IS NOT NULL AND (
           json_type(value, '$.amount_minor') <> 'integer'
           OR json_extract(value, '$.amount_minor') < 0
         )
       )
  ) THEN RAISE(ABORT, 'due_dates must contain canonical v2 entries') END;
  SELECT CASE WHEN NEW.due_days IS NOT NULL AND EXISTS (
    SELECT 1 FROM json_each(NEW.due_days)
    WHERE type <> 'integer' OR value NOT BETWEEN 1 AND 31
  ) THEN RAISE(ABORT, 'due_days must contain integers from 1 to 31') END;
END;

CREATE TRIGGER validate_subscriptions_json_update
BEFORE UPDATE OF due_dates, due_days ON subscriptions
BEGIN
  SELECT CASE WHEN NEW.due_dates IS NOT NULL AND EXISTS (
    SELECT 1 FROM json_each(NEW.due_dates)
    WHERE json_type(value) <> 'object'
       OR json_type(value, '$.date') <> 'text'
       OR length(json_extract(value, '$.date')) <> 10
       OR date(json_extract(value, '$.date'), '+0 days') <> json_extract(value, '$.date')
       OR EXISTS (
         SELECT 1 FROM json_each(value) AS field
         WHERE field.key NOT IN ('date', 'amount_minor')
       )
       OR (
         json_type(value, '$.amount_minor') IS NOT NULL AND (
           json_type(value, '$.amount_minor') <> 'integer'
           OR json_extract(value, '$.amount_minor') < 0
         )
       )
  ) THEN RAISE(ABORT, 'due_dates must contain canonical v2 entries') END;
  SELECT CASE WHEN NEW.due_days IS NOT NULL AND EXISTS (
    SELECT 1 FROM json_each(NEW.due_days)
    WHERE type <> 'integer' OR value NOT BETWEEN 1 AND 31
  ) THEN RAISE(ABORT, 'due_days must contain integers from 1 to 31') END;
END;

CREATE TABLE payment_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  amount REAL GENERATED ALWAYS AS (amount_minor / 100.0) VIRTUAL,
  currency TEXT NOT NULL DEFAULT 'MXN' CHECK (currency IN ('MXN', 'USD')),
  paid_at TEXT NOT NULL CHECK (unixepoch(paid_at) IS NOT NULL),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  category TEXT CHECK (category IS NULL OR length(category) <= 120),
  fx_usd_mxn_micros INTEGER CHECK (fx_usd_mxn_micros IS NULL OR fx_usd_mxn_micros > 0),
  fx_usd_mxn REAL GENERATED ALWAYS AS (
    CASE WHEN fx_usd_mxn_micros IS NULL THEN NULL ELSE fx_usd_mxn_micros / 1000000.0 END
  ) VIRTUAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(created_at) IS NOT NULL),
  CHECK (
    (currency = 'USD') OR fx_usd_mxn_micros IS NULL
  )
) STRICT;

CREATE INDEX idx_payment_records_user_paid
  ON payment_records(user_id, paid_at DESC);
CREATE INDEX idx_payment_records_subscription
  ON payment_records(subscription_id) WHERE subscription_id IS NOT NULL;

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(created_at) IS NOT NULL)
) STRICT;

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE magic_links (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  short_code TEXT,
  expires_at TEXT NOT NULL CHECK (unixepoch(expires_at) IS NOT NULL),
  used_at TEXT CHECK (used_at IS NULL OR unixepoch(used_at) IS NOT NULL)
) STRICT;

CREATE INDEX idx_magic_links_pending
  ON magic_links(email, short_code, expires_at DESC)
  WHERE used_at IS NULL;
CREATE INDEX idx_magic_links_expires ON magic_links(expires_at);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL CHECK (unixepoch(expires_at) IS NOT NULL),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(created_at) IS NOT NULL),
  user_agent TEXT,
  ip TEXT,
  device_name TEXT
) STRICT;

CREATE INDEX idx_sessions_user_created ON sessions(user_id, created_at DESC);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_start TEXT NOT NULL CHECK (unixepoch(window_start) IS NOT NULL)
) STRICT;

CREATE INDEX idx_auth_rate_limits_window ON auth_rate_limits(window_start);

CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0 CHECK (counter >= 0),
  device_name TEXT,
  transports TEXT CHECK (transports IS NULL OR json_valid(transports)),
  backed_up INTEGER NOT NULL DEFAULT 0 CHECK (backed_up IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(created_at) IS NOT NULL),
  last_used_at TEXT CHECK (last_used_at IS NULL OR unixepoch(last_used_at) IS NOT NULL)
) STRICT;

CREATE INDEX idx_passkey_credentials_user_created
  ON passkey_credentials(user_id, created_at DESC);

CREATE TABLE webauthn_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  expires_at TEXT NOT NULL CHECK (unixepoch(expires_at) IS NOT NULL)
) STRICT;

CREATE INDEX idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);

CREATE TABLE subscription_notification_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(sent_at) IS NOT NULL),
  UNIQUE(subscription_id, notification_key)
) STRICT;

CREATE INDEX idx_subscription_notification_claims_sent
  ON subscription_notification_claims(sent_at);

CREATE TABLE email_digest_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  digest_key TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(sent_at) IS NOT NULL),
  UNIQUE(user_id, digest_key)
) STRICT;

CREATE INDEX idx_email_digest_claims_sent ON email_digest_claims(sent_at);

CREATE TABLE notification_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'expired')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(created_at) IS NOT NULL)
) STRICT;

CREATE INDEX idx_notification_attempts_subscription_created
  ON notification_attempts(subscription_id, created_at DESC);
CREATE INDEX idx_notification_attempts_user_created
  ON notification_attempts(user_id, created_at DESC);
CREATE INDEX idx_notification_attempts_created ON notification_attempts(created_at);

CREATE TABLE notification_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('pay', 'snooze')),
  result_payment_id TEXT REFERENCES payment_records(id) ON DELETE SET NULL,
  prev_snapshot TEXT NOT NULL CHECK (json_valid(prev_snapshot)),
  post_action_updated_at TEXT NOT NULL CHECK (unixepoch(post_action_updated_at) IS NOT NULL),
  undone_at TEXT CHECK (undone_at IS NULL OR unixepoch(undone_at) IS NOT NULL),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(created_at) IS NOT NULL)
) STRICT;

CREATE INDEX idx_notification_actions_created ON notification_actions(created_at);
CREATE INDEX idx_notification_actions_user_created
  ON notification_actions(user_id, created_at DESC);
CREATE INDEX idx_notification_actions_subscription
  ON notification_actions(subscription_id);
CREATE INDEX idx_notification_actions_result_payment
  ON notification_actions(result_payment_id) WHERE result_payment_id IS NOT NULL;

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 20000),
  category TEXT CHECK (category IS NULL OR length(category) <= 120),
  trashed_at TEXT CHECK (trashed_at IS NULL OR unixepoch(trashed_at) IS NOT NULL),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(created_at) IS NOT NULL),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(updated_at) IS NOT NULL)
) STRICT;

CREATE INDEX idx_notes_user_updated ON notes(user_id, updated_at DESC);
CREATE INDEX idx_notes_trashed_at ON notes(trashed_at) WHERE trashed_at IS NOT NULL;

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  due_at TEXT NOT NULL CHECK (unixepoch(due_at) IS NOT NULL),
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  notified_at TEXT CHECK (notified_at IS NULL OR unixepoch(notified_at) IS NOT NULL),
  trashed_at TEXT CHECK (trashed_at IS NULL OR unixepoch(trashed_at) IS NOT NULL),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(created_at) IS NOT NULL),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (unixepoch(updated_at) IS NOT NULL)
) STRICT;

CREATE INDEX idx_reminders_user_due ON reminders(user_id, due_at);
CREATE INDEX idx_reminders_pending
  ON reminders(trashed_at, done, notified_at, due_at);

PRAGMA optimize;
