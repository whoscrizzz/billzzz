-- Auditoría agregada v1. No selecciona emails, tokens, nombres ni notas.
SELECT 'users' AS metric, COUNT(*) AS value FROM users
UNION ALL SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL SELECT 'payments', COUNT(*) FROM payment_records
UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL SELECT 'notification_log', COUNT(*) FROM notification_log;

SELECT currency, COUNT(*) AS rows, SUM(round(amount * 100)) AS amount_minor_total
FROM subscriptions GROUP BY currency ORDER BY currency;
SELECT currency, COUNT(*) AS rows, SUM(round(amount * 100)) AS amount_minor_total
FROM payment_records GROUP BY currency ORDER BY currency;

SELECT 'negative_subscription_amount' AS check_name, COUNT(*) AS violations
FROM subscriptions WHERE amount < 0
UNION ALL
SELECT 'subcent_subscription_amount', COUNT(*) FROM subscriptions
WHERE abs(amount * 100 - round(amount * 100)) > 0.0000001
UNION ALL
SELECT 'unsupported_subscription_currency', COUNT(*) FROM subscriptions
WHERE currency NOT IN ('MXN', 'USD')
UNION ALL
SELECT 'negative_payment_amount', COUNT(*) FROM payment_records WHERE amount < 0
UNION ALL
SELECT 'subcent_payment_amount', COUNT(*) FROM payment_records
WHERE abs(amount * 100 - round(amount * 100)) > 0.0000001
UNION ALL
SELECT 'unsupported_payment_currency', COUNT(*) FROM payment_records
WHERE currency NOT IN ('MXN', 'USD');

SELECT 'subscription_user_orphans' AS check_name, COUNT(*) AS violations
FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'payment_user_orphans', COUNT(*)
FROM payment_records p LEFT JOIN users u ON u.id = p.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'payment_subscription_orphans', COUNT(*)
FROM payment_records p LEFT JOIN subscriptions s ON s.id = p.subscription_id
WHERE p.subscription_id IS NOT NULL AND s.id IS NULL
UNION ALL
SELECT 'session_user_orphans', COUNT(*)
FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'push_user_orphans', COUNT(*)
FROM push_subscriptions p LEFT JOIN users u ON u.id = p.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'passkey_user_orphans', COUNT(*)
FROM passkey_credentials p LEFT JOIN users u ON u.id = p.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'note_user_orphans', COUNT(*)
FROM notes n LEFT JOIN users u ON u.id = n.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'reminder_user_orphans', COUNT(*)
FROM reminders r LEFT JOIN users u ON u.id = r.user_id WHERE u.id IS NULL;

SELECT frequency, COUNT(*) AS rows FROM subscriptions GROUP BY frequency ORDER BY frequency;
SELECT 'invalid_due_date' AS check_name, COUNT(*) AS violations FROM subscriptions
WHERE due_date IS NOT NULL AND (length(due_date) <> 10 OR date(due_date, '+0 days') <> due_date)
UNION ALL
SELECT 'invalid_due_dates_json', COUNT(*) FROM subscriptions
WHERE due_dates IS NOT NULL AND (json_valid(due_dates) = 0 OR json_type(due_dates) <> 'array')
UNION ALL
SELECT 'invalid_due_days_json', COUNT(*) FROM subscriptions
WHERE due_days IS NOT NULL AND (json_valid(due_days) = 0 OR json_type(due_days) <> 'array')
UNION ALL
SELECT 'archive_trash_overlap', COUNT(*) FROM subscriptions
WHERE deleted_at IS NOT NULL AND trashed_at IS NOT NULL
UNION ALL
SELECT 'invalid_interval', COUNT(*) FROM subscriptions
WHERE frequency = 'interval' AND (
  interval_count IS NULL OR interval_count < 1 OR interval_unit NOT IN ('day', 'week', 'month')
)
UNION ALL
SELECT 'interval_fields_on_other_frequency', COUNT(*) FROM subscriptions
WHERE frequency <> 'interval' AND (interval_count IS NOT NULL OR interval_unit IS NOT NULL);

SELECT
  COUNT(*) AS sessions_total,
  SUM(CASE WHEN id IS NULL OR id = '' THEN 1 ELSE 0 END) AS sessions_without_id,
  SUM(CASE WHEN unixepoch(expires_at) > unixepoch() THEN 1 ELSE 0 END) AS sessions_active,
  SUM(CASE WHEN unixepoch(expires_at) <= unixepoch() THEN 1 ELSE 0 END) AS sessions_expired
FROM sessions;

SELECT name, tbl_name, sql FROM sqlite_master
WHERE type = 'index' AND sql IS NOT NULL ORDER BY tbl_name, name;
