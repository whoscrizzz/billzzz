import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function createDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(new URL('../migrations/0001_v2_baseline.sql', import.meta.url), 'utf8'));
  return db;
}

function seedUser(db) {
  db.prepare(`INSERT INTO users (id, email) VALUES (?, ?)`).run(
    '00000000-0000-4000-8000-000000000001',
    'test@example.com'
  );
}

test('todas las tablas de aplicación son STRICT y la integridad inicia limpia', () => {
  const db = createDb();
  const rows = db
    .prepare(
      `SELECT name, strict FROM pragma_table_list
       WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%'`
    )
    .all();
  assert.ok(rows.length >= 15);
  assert.ok(rows.every((row) => row.strict === 1));
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('subscriptions acepta interval y rechaza invariantes rotas', () => {
  const db = createDb();
  seedUser(db);
  const insert = db.prepare(
    `INSERT INTO subscriptions
       (id, user_id, name, amount_minor, currency, due_day, frequency, due_date,
        interval_count, interval_unit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  assert.doesNotThrow(() =>
    insert.run(
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
      'Hosting',
      29900,
      'USD',
      21,
      'interval',
      '2026-09-21',
      2,
      'month'
    )
  );
  assert.throws(() =>
    insert.run(
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000001',
      'Inválida',
      100,
      'MXN',
      1,
      'interval',
      '2026-09-01',
      null,
      null
    )
  );
});

test('rechaza IDs nulos, monedas, montos, fechas, JSON y booleanos inválidos', () => {
  const db = createDb();
  assert.throws(() => db.prepare(`INSERT INTO users (id) VALUES (NULL)`).run());
  seedUser(db);

  const base = `INSERT INTO subscriptions
    (id, user_id, name, amount_minor, currency, due_day, frequency, due_date)
    VALUES (?, ?, 'x', ?, ?, 1, 'monthly', ?)`;
  const stmt = db.prepare(base);
  assert.throws(() =>
    stmt.run('bad-amount', '00000000-0000-4000-8000-000000000001', -1, 'MXN', '2026-09-01')
  );
  assert.throws(() =>
    stmt.run('bad-currency', '00000000-0000-4000-8000-000000000001', 1, 'EUR', '2026-09-01')
  );
  assert.throws(() =>
    stmt.run('bad-date', '00000000-0000-4000-8000-000000000001', 1, 'MXN', '2026-02-31')
  );
  assert.throws(() =>
    db
      .prepare(
        `INSERT INTO subscriptions
          (id, user_id, name, amount_minor, currency, due_day, frequency, due_dates)
         VALUES ('bad-json', ?, 'x', 1, 'MXN', 1, 'monthly', 'no-json')`
      )
      .run('00000000-0000-4000-8000-000000000001')
  );
  assert.throws(() =>
    db
      .prepare(
        `INSERT INTO subscriptions
          (id, user_id, name, amount_minor, currency, due_day, frequency, due_dates)
         VALUES ('bad-json-date', ?, 'x', 1, 'MXN', 1, 'monthly',
                 '[{"date":"2026-02-31","amount_minor":100}]')`
      )
      .run('00000000-0000-4000-8000-000000000001')
  );
  assert.throws(() =>
    db
      .prepare(
        `INSERT INTO subscriptions
          (id, user_id, name, amount_minor, currency, due_day, frequency, due_days)
         VALUES ('bad-json-day', ?, 'x', 1, 'MXN', 1, 'monthly', '[1,32]')`
      )
      .run('00000000-0000-4000-8000-000000000001')
  );
  assert.throws(() =>
    db.prepare(`UPDATE users SET disabled = 2 WHERE id = ?`).run(
      '00000000-0000-4000-8000-000000000001'
    )
  );
});

test('ON DELETE SET NULL conserva el snapshot del pago', () => {
  const db = createDb();
  seedUser(db);
  const userId = '00000000-0000-4000-8000-000000000001';
  const subId = '00000000-0000-4000-8000-000000000002';
  db.prepare(
    `INSERT INTO subscriptions
      (id, user_id, name, amount_minor, currency, due_day, frequency, due_date, trashed_at)
     VALUES (?, ?, 'Netflix', 21900, 'MXN', 1, 'monthly', '2026-09-01',
             '2026-07-01T00:00:00.000Z')`
  ).run(subId, userId);
  db.prepare(
    `INSERT INTO payment_records
      (id, user_id, subscription_id, amount_minor, currency, paid_at, name, category)
     VALUES ('payment-1', ?, ?, 21900, 'MXN', '2026-08-01T12:00:00.000Z',
             'Netflix', 'Entretenimiento')`
  ).run(userId, subId);
  db.prepare(`DELETE FROM subscriptions WHERE id = ?`).run(subId);
  const payment = db.prepare(`SELECT subscription_id, name FROM payment_records`).get();
  assert.equal(payment.subscription_id, null);
  assert.equal(payment.name, 'Netflix');
});

test('los índices calientes eliminan scans y sorts temporales esperados', () => {
  const db = createDb();
  const plans = [
    `SELECT * FROM subscriptions
      WHERE user_id = 'u' AND deleted_at IS NULL AND trashed_at IS NULL
      ORDER BY due_day, name`,
    `SELECT * FROM payment_records WHERE user_id = 'u' ORDER BY paid_at DESC LIMIT 100`,
    `SELECT id FROM users WHERE capture_token = 't' AND disabled = 0`,
    `SELECT id FROM notification_actions
      WHERE user_id = 'u' ORDER BY created_at DESC`,
    `SELECT id FROM notification_actions WHERE subscription_id = 's'`,
    `SELECT id FROM notification_actions WHERE result_payment_id = 'p'`,
  ];
  for (const sql of plans) {
    const detail = db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all()
      .map((row) => row.detail)
      .join('\n');
    assert.match(detail, /USING (?:COVERING )?INDEX/);
    assert.doesNotMatch(detail, /USE TEMP B-TREE/);
  }
});
