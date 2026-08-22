PRAGMA foreign_key_check;
PRAGMA integrity_check;

SELECT 'users' AS table_name, COUNT(*) AS rows FROM users
UNION ALL SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL SELECT 'payment_records', COUNT(*) FROM payment_records
UNION ALL SELECT 'notes', COUNT(*) FROM notes
UNION ALL SELECT 'reminders', COUNT(*) FROM reminders;

SELECT currency, COUNT(*) AS rows, SUM(amount_minor) AS amount_minor_total
FROM subscriptions GROUP BY currency ORDER BY currency;
SELECT currency, COUNT(*) AS rows, SUM(amount_minor) AS amount_minor_total
FROM payment_records GROUP BY currency ORDER BY currency;

EXPLAIN QUERY PLAN SELECT * FROM subscriptions
WHERE user_id = 'probe' AND deleted_at IS NULL AND trashed_at IS NULL ORDER BY due_day, name;
EXPLAIN QUERY PLAN SELECT * FROM subscriptions
WHERE deleted_at IS NULL AND trashed_at IS NULL AND due_date = '2099-01-01';
EXPLAIN QUERY PLAN SELECT * FROM payment_records
WHERE user_id = 'probe' ORDER BY paid_at DESC LIMIT 100;
EXPLAIN QUERY PLAN SELECT id FROM users WHERE capture_token = 'probe' AND disabled = 0;

PRAGMA optimize;
