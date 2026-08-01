// Tests for Fase 6b — "Marcar todos" desde un push agrupado.
// Imports the real worker/src modules (see test-helpers/load-ts-module.mjs)
// so a regression in the shipped code actually fails these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { mintGroupActionToken, resolveGroupActionAuth } = await loadTsModule(
  'worker/src/notification-actions.ts'
);
const { payAllSubscriptions } = await loadTsModule('worker/src/subscriptions.ts');

const SECRET = 'test-secret-not-real';

function baseSub(overrides = {}) {
  return {
    id: 's1',
    user_id: 'user-1',
    name: 'Test',
    amount: 100,
    currency: 'MXN',
    due_day: 1,
    due_date: '2026-08-01',
    due_dates: null,
    frequency: 'monthly',
    category: null,
    notes: null,
    notify_days_before: 3,
    notify_hour: 9,
    snoozed_until: null,
    created_at: '2020-01-01T00:00:00.000Z',
    updated_at: '2020-01-01T00:00:00.000Z',
    deleted_at: null,
    trashed_at: null,
    last_paid_at: null,
    ...overrides,
  };
}

/** Fake D1Database para resolveGroupActionAuth — solo cubre el SELECT
 * subscription->user_id+action_token_version, con un valor distinto por id
 * para poder simular tokens que mezclan usuarios o versiones viejas. */
function groupAuthFakeDb(rowsById) {
  return {
    prepare() {
      return {
        bind(id) {
          this._id = id;
          return this;
        },
        async first() {
          return rowsById[this._id] ?? null;
        },
      };
    },
  };
}

test('resolveGroupActionAuth: token válido, mismo usuario y versión → autoriza todos los items', async () => {
  const items = [
    { subscriptionId: 'sub-1', notificationKey: 'sub-1:2026-08-05:0' },
    { subscriptionId: 'sub-2', notificationKey: 'sub-2:2026-08-05:0' },
  ];
  const token = await mintGroupActionToken(items, 0, SECRET);
  const db = groupAuthFakeDb({
    'sub-1': { user_id: 'user-1', action_token_version: 0 },
    'sub-2': { user_id: 'user-1', action_token_version: 0 },
  });
  const auth = await resolveGroupActionAuth(token, db, SECRET);
  assert.equal(auth.ok, true);
  if (auth.ok) {
    assert.equal(auth.userId, 'user-1');
    assert.deepEqual(auth.items, items);
  }
});

test('resolveGroupActionAuth: action_token_version vieja en alguna subscripción → 401', async () => {
  const items = [
    { subscriptionId: 'sub-1', notificationKey: 'sub-1:2026-08-05:0' },
    { subscriptionId: 'sub-2', notificationKey: 'sub-2:2026-08-05:0' },
  ];
  const token = await mintGroupActionToken(items, 0, SECRET);
  const db = groupAuthFakeDb({
    'sub-1': { user_id: 'user-1', action_token_version: 0 },
    'sub-2': { user_id: 'user-1', action_token_version: 1 }, // sesión revocada después de emitir
  });
  const auth = await resolveGroupActionAuth(token, db, SECRET);
  assert.deepEqual(auth, { ok: false, status: 401 });
});

test('resolveGroupActionAuth: subs de dos usuarios distintos → 403, nunca mezcla cuentas', async () => {
  const items = [
    { subscriptionId: 'sub-1', notificationKey: 'sub-1:2026-08-05:0' },
    { subscriptionId: 'sub-2', notificationKey: 'sub-2:2026-08-05:0' },
  ];
  const token = await mintGroupActionToken(items, 0, SECRET);
  const db = groupAuthFakeDb({
    'sub-1': { user_id: 'user-1', action_token_version: 0 },
    'sub-2': { user_id: 'user-2', action_token_version: 0 },
  });
  const auth = await resolveGroupActionAuth(token, db, SECRET);
  assert.deepEqual(auth, { ok: false, status: 403 });
});

function racedActionRow(key) {
  return {
    id: key,
    user_id: 'user-1',
    subscription_id: key.split(':')[0],
    action: 'pay',
    result_payment_id: 'raced-payment',
    prev_snapshot: '{}',
    post_action_updated_at: '2026-08-01T00:00:00.000Z',
    undone_at: null,
  };
}

/** Fake D1Database para payAllSubscriptions — cubre las 3 rutas que toca:
 * SELECT notification_actions (pre-check + relectura tras perder el claim),
 * SELECT subscriptions, e INSERT notification_actions (el claim en sí).
 *  - `preExisting`: claves con una fila desde el arranque — nunca llegan a
 *    intentar un claim (caso "ya estaba resuelto antes de empezar").
 *  - `raceKeys`: claves sin fila al inicio, pero cuyo INSERT tira UNIQUE
 *    constraint (perdió el claim) — la relectura posterior sí encuentra la
 *    fila que ganó esa carrera. */
function payAllFakeDb({ subs, preExisting = {}, raceKeys = [] }) {
  const insertedForRaceKey = new Set();
  const batchCalls = [];

  return {
    prepare(sql) {
      return {
        _sql: sql,
        bind(...args) {
          this._args = args;
          return this;
        },
        async first() {
          if (this._sql.includes('FROM notification_actions')) {
            const key = this._args[0];
            if (preExisting[key]) return preExisting[key];
            if (raceKeys.includes(key) && insertedForRaceKey.has(key)) return racedActionRow(key);
            return null;
          }
          if (this._sql.includes('FROM subscriptions')) {
            const id = this._args[0];
            return subs.find((s) => s.id === id) ?? null;
          }
          return null;
        },
        async run() {
          if (this._sql.includes('INSERT INTO notification_actions')) {
            const key = this._args[0];
            if (raceKeys.includes(key)) {
              insertedForRaceKey.add(key);
              throw new Error('UNIQUE constraint failed: notification_actions.id');
            }
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
    async batch(statements) {
      batchCalls.push(statements);
      return statements.map(() => ({ success: true }));
    },
    _batchCalls: batchCalls,
  };
}

test('payAllSubscriptions: un solo db.batch cubre a todos los ganadores del claim, y a nadie más', async () => {
  const items = [
    { subscriptionId: 'sub-ok-1', notificationKey: 'sub-ok-1:2026-08-01:0' },
    { subscriptionId: 'sub-ok-2', notificationKey: 'sub-ok-2:2026-08-01:0' },
    { subscriptionId: 'sub-race', notificationKey: 'sub-race:2026-08-01:0' },
    { subscriptionId: 'sub-missing', notificationKey: 'sub-missing:2026-08-01:0' },
  ];
  const subs = [
    baseSub({ id: 'sub-ok-1' }),
    baseSub({ id: 'sub-ok-2' }),
    baseSub({ id: 'sub-race' }),
    // 'sub-missing' deliberadamente ausente — subscripción borrada/inexistente.
  ];
  const db = payAllFakeDb({ subs, raceKeys: ['sub-race:2026-08-01:0'] });

  const res = await payAllSubscriptions(db, 'user-1', items);
  const body = await res.json();

  assert.equal(db._batchCalls.length, 1, 'un solo db.batch para todo el grupo');
  assert.equal(
    db._batchCalls[0].length,
    4,
    'solo los 2 ganadores del claim aportan statements (2 c/u: INSERT payment + UPDATE subscription)'
  );

  const byId = Object.fromEntries(body.results.map((r) => [r.subscriptionId, r]));
  assert.equal(Object.keys(byId).length, 3, 'sub-missing se omite en silencio, no aparece en results');
  assert.ok(!('sub-missing' in byId));

  assert.equal(byId['sub-ok-1'].ok, true);
  assert.ok(!byId['sub-ok-1'].alreadyProcessed);
  assert.equal(byId['sub-ok-2'].ok, true);
  assert.ok(!byId['sub-ok-2'].alreadyProcessed);

  assert.equal(byId['sub-race'].alreadyProcessed, true, 'perdió el claim → se reporta como ya procesado');
  assert.equal(byId['sub-race'].paymentId, 'raced-payment', 'el pago reportado es el del ganador de la carrera');
});

test('payAllSubscriptions: un notification_action pre-existente (action pay) no reclama de nuevo', async () => {
  const items = [{ subscriptionId: 'sub-done', notificationKey: 'sub-done:2026-08-01:0' }];
  const subs = [baseSub({ id: 'sub-done' })];
  const db = payAllFakeDb({
    subs,
    preExisting: {
      'sub-done:2026-08-01:0': {
        id: 'sub-done:2026-08-01:0',
        user_id: 'user-1',
        subscription_id: 'sub-done',
        action: 'pay',
        result_payment_id: 'already-paid',
        prev_snapshot: '{}',
        post_action_updated_at: '2026-07-31T00:00:00.000Z',
        undone_at: null,
      },
    },
  });

  const res = await payAllSubscriptions(db, 'user-1', items);
  const body = await res.json();

  assert.equal(db._batchCalls.length, 0, 'nada que batchear, no ganó ningún claim nuevo');
  assert.equal(body.results.length, 1);
  assert.equal(body.results[0].alreadyProcessed, true);
  assert.equal(body.results[0].paymentId, 'already-paid');
});
