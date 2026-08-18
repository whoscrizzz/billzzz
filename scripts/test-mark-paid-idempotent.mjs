// Regresión: reproduce el bug reportado por el usuario donde los
// recordatorios se corrían de fecha o caían a historial al actualizar la
// app. Causa: markSubscriptionPaid/snoozeSubscription solo tenían
// protección de idempotencia (notificationKey) cuando la llamada venía de
// un botón de notificación push — el camino normal del cliente (cola
// offline en sync.ts) nunca la mandaba, así que un reload a mitad de un
// mark-paid (p. ej. el usuario tocando "Actualizar ahora" del PWA update
// prompt) hacía que el replay de la cola ejecutara el pago una segunda vez:
// la fecha avanzaba dos ciclos, o si era la última fecha de una lista
// due_dates, la suscripción se archivaba de más.
//
// El fix es enteramente del lado del cliente (useSubscriptions.ts genera y
// reenvía la misma notificationKey en cada replay) — este test verifica que
// el servidor, que YA soporta ese campo de forma genérica para el flujo de
// push, se comporta igual cuando la clave llega por el camino de sesión
// normal, sin X-Action-Token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { markSubscriptionPaid, snoozeSubscription } = await loadTsModule(
  'worker/src/subscriptions.ts'
);

const USER_ID = 'user-1';

/** Fake D1Database con estado mutable — a diferencia de test-capture.mjs
 * (un solo INSERT), markSubscriptionPaid/snoozeSubscription leen y escriben
 * la misma fila de `subscriptions` en varios pasos, incluyendo un db.batch,
 * así que hace falta una tabla real en memoria, no solo respuestas fijas. */
function fakeDb({ subscriptions = [] } = {}) {
  const subs = new Map(subscriptions.map((s) => [s.id, { ...s }]));
  const notificationActions = new Map();
  const paymentRecords = [];

  function prepare(sql) {
    return {
      _sql: sql,
      bind(...args) {
        this._args = args;
        return this;
      },
      async first() {
        const a = this._args ?? [];
        if (this._sql.includes('FROM subscriptions s') && this._sql.includes('JOIN users u')) {
          const [id, userId] = a;
          const sub = subs.get(id);
          if (!sub || sub.user_id !== userId || sub.deleted_at || sub.trashed_at) return null;
          return { ...sub, user_timezone: 'America/Mexico_City', user_fx_usd_mxn: null };
        }
        if (this._sql.includes('SELECT id, snoozed_until FROM subscriptions')) {
          const [id, userId] = a;
          const sub = subs.get(id);
          if (!sub || sub.user_id !== userId || sub.deleted_at || sub.trashed_at) return null;
          return { id: sub.id, snoozed_until: sub.snoozed_until };
        }
        if (this._sql.includes('FROM notification_actions')) {
          const [key] = a;
          return notificationActions.get(key) ?? null;
        }
        return null;
      },
      async run() {
        const a = this._args ?? [];
        if (this._sql.startsWith('INSERT INTO payment_records')) {
          const [id, user_id, subscription_id, amount, currency, paid_at, notes, fx_usd_mxn] = a;
          paymentRecords.push({
            id,
            user_id,
            subscription_id,
            amount,
            currency,
            paid_at,
            notes,
            fx_usd_mxn,
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (this._sql.startsWith('UPDATE subscriptions SET') && this._sql.includes('due_date')) {
          const [last_paid_at, due_date, due_day, due_dates, updated_at, id, userId] = a;
          const sub = subs.get(id);
          if (sub && sub.user_id === userId) {
            Object.assign(sub, {
              last_paid_at,
              due_date,
              due_day,
              due_dates,
              snoozed_until: null,
              updated_at,
            });
          }
          return { success: true, meta: { changes: sub ? 1 : 0 } };
        }
        if (this._sql.startsWith('UPDATE subscriptions SET') && this._sql.includes('deleted_at')) {
          const [last_paid_at, deleted_at, updated_at, id, userId] = a;
          const sub = subs.get(id);
          if (sub && sub.user_id === userId) {
            Object.assign(sub, { last_paid_at, deleted_at, updated_at });
          }
          return { success: true, meta: { changes: sub ? 1 : 0 } };
        }
        if (this._sql.startsWith('UPDATE subscriptions SET snoozed_until')) {
          const [snoozed_until, updated_at, id, userId] = a;
          const sub = subs.get(id);
          if (sub && sub.user_id === userId) {
            Object.assign(sub, { snoozed_until, updated_at });
          }
          return { success: true, meta: { changes: sub ? 1 : 0 } };
        }
        if (this._sql.startsWith('INSERT INTO notification_actions')) {
          const [id, user_id, subscription_id, action, result_payment_id, prev_snapshot, post_action_updated_at] =
            a;
          if (notificationActions.has(id)) {
            throw new Error(
              'D1_ERROR: UNIQUE constraint failed: notification_actions.id: SQLITE_CONSTRAINT'
            );
          }
          notificationActions.set(id, {
            id,
            user_id,
            subscription_id,
            action,
            result_payment_id,
            prev_snapshot,
            post_action_updated_at,
            undone_at: null,
            created_at: new Date().toISOString(),
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (this._sql.startsWith('DELETE FROM notification_actions')) {
          notificationActions.delete(a[0]);
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
  }

  return {
    _subs: subs,
    _paymentRecords: paymentRecords,
    prepare,
    async batch(statements) {
      const results = [];
      for (const s of statements) results.push(await s.run());
      return results;
    },
  };
}

const req = (body) =>
  new Request('https://x.test/billzzz-api/subscriptions/sub-1/mark-paid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

function monthlySub(overrides = {}) {
  return {
    id: 'sub-1',
    user_id: USER_ID,
    name: 'Netflix',
    amount: 219,
    currency: 'MXN',
    due_day: 5,
    frequency: 'monthly',
    due_date: '2026-08-05',
    due_dates: null,
    due_days: null,
    interval_count: null,
    interval_unit: null,
    category: null,
    notes: null,
    notify_days_before: 1,
    notify_hour: 9,
    snoozed_until: null,
    deleted_at: null,
    trashed_at: null,
    last_paid_at: null,
    created_at: '2026-01-05T00:00:00.000Z',
    updated_at: '2026-01-05T00:00:00.000Z',
    ...overrides,
  };
}

test('mark-paid replay con la misma notificationKey no avanza la fecha dos veces', async () => {
  const db = fakeDb({ subscriptions: [monthlySub()] });
  const notificationKey = 'client-generated-key-1';

  const first = await markSubscriptionPaid(
    req({ paid_at: '2026-08-05', notificationKey }),
    db,
    USER_ID,
    'sub-1'
  );
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.archived, false);
  const dueDateAfterFirst = db._subs.get('sub-1').due_date;
  assert.notEqual(dueDateAfterFirst, '2026-08-05', 'la primera llamada sí debe avanzar el ciclo');

  // Simula el replay de sync.ts tras un reload a mitad de vuelo: mismo
  // subscriptionId, mismo payload (misma notificationKey).
  const second = await markSubscriptionPaid(
    req({ paid_at: '2026-08-05', notificationKey }),
    db,
    USER_ID,
    'sub-1'
  );
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.alreadyProcessed, true);
  assert.equal(
    db._subs.get('sub-1').due_date,
    dueDateAfterFirst,
    'el replay no debe avanzar la fecha una segunda vez'
  );
  assert.equal(
    db._paymentRecords.length,
    1,
    'el replay no debe insertar un segundo payment_record'
  );
});

test('mark-paid replay sobre la última fecha de due_dates no archiva dos veces', async () => {
  const sub = monthlySub({
    frequency: 'monthly',
    due_date: '2026-08-20',
    due_dates: JSON.stringify([{ date: '2026-08-20' }]),
  });
  const db = fakeDb({ subscriptions: [sub] });
  const notificationKey = 'client-generated-key-2';

  const first = await markSubscriptionPaid(
    req({ paid_at: '2026-08-20', notificationKey }),
    db,
    USER_ID,
    'sub-1'
  );
  const firstBody = await first.json();
  assert.equal(firstBody.archived, true);
  assert.ok(db._subs.get('sub-1').deleted_at, 'se archiva tras la última fecha pendiente');

  const second = await markSubscriptionPaid(
    req({ paid_at: '2026-08-20', notificationKey }),
    db,
    USER_ID,
    'sub-1'
  );
  const secondBody = await second.json();
  assert.equal(secondBody.alreadyProcessed, true);
  assert.equal(db._paymentRecords.length, 1, 'un solo pago, no uno por cada replay');
});

test('mark-paid sin notificationKey (comportamiento previo) sigue funcionando', async () => {
  const db = fakeDb({ subscriptions: [monthlySub()] });
  const res = await markSubscriptionPaid(req({ paid_at: '2026-08-05' }), db, USER_ID, 'sub-1');
  assert.equal(res.status, 200);
  assert.equal(db._paymentRecords.length, 1);
});

test('snooze replay con la misma notificationKey no reinicia el conteo de días', async () => {
  const db = fakeDb({ subscriptions: [monthlySub()] });
  const notificationKey = 'client-generated-key-3';

  const reqSnooze = (body) =>
    new Request('https://x.test/billzzz-api/subscriptions/sub-1/snooze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const first = await snoozeSubscription(
    reqSnooze({ days: 3, notificationKey }),
    db,
    USER_ID,
    'sub-1'
  );
  assert.equal(first.status, 200);
  const snoozedUntilAfterFirst = db._subs.get('sub-1').snoozed_until;
  assert.ok(snoozedUntilAfterFirst);

  const second = await snoozeSubscription(
    reqSnooze({ days: 3, notificationKey }),
    db,
    USER_ID,
    'sub-1'
  );
  const secondBody = await second.json();
  assert.equal(secondBody.alreadyProcessed, true);
  assert.equal(
    db._subs.get('sub-1').snoozed_until,
    snoozedUntilAfterFirst,
    'el replay no debe recalcular snoozed_until desde "hoy" otra vez'
  );
});
