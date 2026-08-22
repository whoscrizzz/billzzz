import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const USER = '00000000-0000-4000-8000-000000000001';

function fixtureSql() {
  return `
CREATE TABLE users (
  id TEXT PRIMARY KEY, display_name TEXT, created_at TEXT, email TEXT, calendar_token TEXT,
  budget_limit REAL, email_reminders INTEGER, capture_token TEXT, disabled INTEGER,
  timezone TEXT, action_token_version INTEGER, fx_usd_mxn REAL
);
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY, user_id TEXT, name TEXT, amount REAL, currency TEXT, due_day INTEGER,
  frequency TEXT, category TEXT, notes TEXT, notify_days_before INTEGER, created_at TEXT,
  updated_at TEXT, deleted_at TEXT, due_date TEXT, last_paid_at TEXT, notify_hour INTEGER,
  snoozed_until TEXT, due_dates TEXT, interval_count INTEGER, interval_unit TEXT,
  due_days TEXT, trashed_at TEXT
);
CREATE TABLE payment_records (
  id TEXT PRIMARY KEY, user_id TEXT, subscription_id TEXT, amount REAL, currency TEXT,
  paid_at TEXT, notes TEXT, name TEXT, category TEXT, created_at TEXT, fx_usd_mxn REAL
);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, created_at TEXT, id TEXT,
  user_agent TEXT, ip TEXT, device_name TEXT
);
INSERT INTO users VALUES
  ('${USER}', 'Cristofer', '2025-01-01 00:00:00', 'test@example.com', NULL,
   1500.25, 1, 'capture', 0, 'America/Mexico_City', 0, 18.5);
INSERT INTO subscriptions VALUES
  ('monthly', '${USER}', 'Internet', 599.90, 'MXN', 31, 'monthly', 'Servicios', NULL, 1,
   '2025-01-01 00:00:00', '2025-01-01 00:00:00', NULL, NULL, NULL, 9, NULL, NULL,
   NULL, NULL, NULL, NULL),
  ('interval', '${USER}', 'Dominio', 12.34, 'USD', 1, 'interval', 'Trabajo', NULL, 1,
   '2025-01-01 00:00:00', '2025-01-01 00:00:00', NULL, '2026-09-15', NULL, 9, NULL,
   NULL, 2, 'month', NULL, NULL),
  ('multi', '${USER}', 'Quincenal', 100, 'MXN', 1, 'monthly', NULL, NULL, 1,
   '2025-01-01 00:00:00', '2025-01-01 00:00:00', NULL, NULL, NULL, 9, NULL,
   '[{"date":"2026-09-01","amount":100.25},{"date":"2026-09-15"}]', NULL, NULL,
   '[1,15]', NULL),
  ('once', '${USER}', 'Compra única', 25, 'USD', 20, 'once', NULL, NULL, 1,
   '2025-01-01 00:00:00', '2025-01-01 00:00:00', '2026-08-20 10:00:00',
   '2026-08-20', NULL, 9, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO payment_records VALUES
  ('p1', '${USER}', 'monthly', 599.90, 'MXN', '2026-08-01 12:00:00', NULL, NULL, NULL,
   '2026-08-01 12:00:00', NULL),
  ('p2', '${USER}', 'interval', 12.34, 'USD', '2026-08-02T12:00:00.000Z', NULL, NULL, NULL,
   '2026-08-02T12:00:00.000Z', 18.5),
  ('p3', '${USER}', 'purged-sub', 75, 'MXN', '2026-08-03T12:00:00.000Z', NULL,
   'Gasto preservado', 'Otros', '2026-08-03T12:00:00.000Z', NULL);
INSERT INTO sessions VALUES
  ('hash', '${USER}', '2027-01-01T00:00:00.000Z', '2026-08-01 00:00:00', NULL,
   'Safari', NULL, 'Mac');
`;
}

test('transforma fixtures v1, reconcilia centavos y conserva snapshots', () => {
  const dir = mkdtempSync(join(tmpdir(), 'billzzz-d1-v2-'));
  const source = join(dir, 'v1.sql');
  const target = join(dir, 'v2.sqlite');
  const report = join(dir, 'report.json');
  const output = join(dir, 'import.sql');
  writeFileSync(source, fixtureSql());

  const result = spawnSync(
    process.execPath,
    [
      new URL('./transform-d1-v1-to-v2.mjs', import.meta.url).pathname,
      '--source-sql',
      source,
      '--target',
      target,
      '--report',
      report,
      '--output-sql',
      output,
      '--as-of',
      '2026-08-21T12:00:00.000Z',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);

  const db = new DatabaseSync(target, { readOnly: true });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM subscriptions').get().n, 4);
  assert.equal(db.prepare('SELECT SUM(amount_minor) AS total FROM payment_records').get().total, 68724);
  const orphanSnapshot = db.prepare(`SELECT subscription_id, name FROM payment_records WHERE id = 'p3'`).get();
  assert.equal(orphanSnapshot.subscription_id, null);
  assert.equal(orphanSnapshot.name, 'Gasto preservado');
  assert.equal(db.prepare(`SELECT id FROM sessions`).get().id.length, 36);
  const dueDates = JSON.parse(db.prepare(`SELECT due_dates FROM subscriptions WHERE id = 'multi'`).get().due_dates);
  assert.equal(dueDates[0].amount_minor, 10025);
  db.close();

  const parsedReport = JSON.parse(readFileSync(report, 'utf8'));
  assert.deepEqual(parsedReport.rejected, []);
  assert.equal(parsedReport.reconciliation.v1_payment_minor_total, 68724);
  assert.match(readFileSync(output, 'utf8'), /PRAGMA optimize;/);
});
