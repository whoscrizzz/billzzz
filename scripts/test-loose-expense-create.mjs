// Tests para createLooseExpense (worker/src/subscriptions.ts) — el gasto ya
// pagado sin bill detrás que ahora usan Quick-Add "una sola vez" y el flujo
// de compartir texto, en vez de crear una fila en `subscriptions` con
// vencimiento a 7 días (el bug de "sigue marcando como bills" reportado por
// el usuario). Mismo shape de payment_records que ya produce captureExpense
// para el Atajo de Siri (subscription_id NULL), pero por sesión en vez de
// X-Capture-Token — ver test-capture.mjs para el equivalente token-auth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { createLooseExpense } = await loadTsModule('worker/src/subscriptions.ts');

const USER_ID = 'user-1';

function fakeDb({ fxUsdMxn = null, existing = [] } = {}) {
  const inserted = [...existing];
  return {
    _inserted: inserted,
    prepare(sql) {
      return {
        _sql: sql,
        bind(...args) {
          this._args = args;
          return this;
        },
        async first() {
          if (this._sql.includes('FROM users')) {
            return { fx_usd_mxn: fxUsdMxn };
          }
          if (this._sql.includes('FROM payment_records')) {
            const [id, userId] = this._args;
            const row = inserted.find((r) => r.id === id && r.user_id === userId);
            return row ? { id: row.id, paid_at: row.paid_at } : null;
          }
          return null;
        },
        async run() {
          if (this._sql.includes('INSERT INTO payment_records')) {
            const [id, user_id, amount, currency, paid_at, notes, name, category, fx_usd_mxn] =
              this._args;
            if (inserted.some((r) => r.id === id)) {
              throw new Error(
                'D1_ERROR: UNIQUE constraint failed: payment_records.id: SQLITE_CONSTRAINT'
              );
            }
            inserted.push({
              id,
              user_id,
              subscription_id: null,
              amount,
              currency,
              paid_at,
              notes,
              name,
              category,
              fx_usd_mxn,
            });
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };
}

const req = (body) =>
  new Request('https://x.test/billzzz-api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('gasto suelto: subscription_id queda NULL, name/category propios', async () => {
  const db = fakeDb();
  const res = await createLooseExpense(
    req({ amount: 500, name: 'Pago personal', category: 'Personal' }),
    db,
    USER_ID
  );
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.paymentId);
  assert.ok(body.paid_at);

  assert.equal(db._inserted.length, 1);
  const row = db._inserted[0];
  assert.equal(row.subscription_id, null, 'no debe crear ni referenciar ningún bill');
  assert.equal(row.name, 'Pago personal');
  assert.equal(row.category, 'Personal');
  assert.equal(row.currency, 'MXN', 'moneda por defecto');
});

test('dedup por id client-generado: retry devuelve 200 sin duplicar', async () => {
  const db = fakeDb();
  const id = '11111111-1111-4111-8111-111111111111';
  const first = await createLooseExpense(req({ id, amount: 100, name: 'Colegiatura' }), db, USER_ID);
  assert.equal(first.status, 201);

  const second = await createLooseExpense(req({ id, amount: 100, name: 'Colegiatura' }), db, USER_ID);
  assert.equal(second.status, 200);
  const body = await second.json();
  assert.equal(body.paymentId, id);
  assert.equal(db._inserted.length, 1, 'un retry no debe duplicar el gasto');
});

test('nombre requerido → 400, sin escribir', async () => {
  const db = fakeDb();
  const res = await createLooseExpense(req({ amount: 50 }), db, USER_ID);
  assert.equal(res.status, 400);
  assert.equal(db._inserted.length, 0);
});

test('montos inválidos → 400, sin escribir', async () => {
  for (const amount of [-1, Number.NaN, undefined]) {
    const db = fakeDb();
    const res = await createLooseExpense(req({ amount, name: 'x' }), db, USER_ID);
    assert.equal(res.status, 400, `amount=${String(amount)} debe rechazarse`);
    assert.equal(db._inserted.length, 0);
  }
});

test('paid_at inválido → 400', async () => {
  const db = fakeDb();
  const res = await createLooseExpense(
    req({ amount: 10, name: 'x', paid_at: 'no-es-fecha' }),
    db,
    USER_ID
  );
  assert.equal(res.status, 400);
});

test('USD congela fx_usd_mxn del usuario al momento del gasto', async () => {
  const db = fakeDb({ fxUsdMxn: 18.5 });
  await createLooseExpense(req({ amount: 20, name: 'Hosting', currency: 'USD' }), db, USER_ID);
  assert.equal(db._inserted[0].fx_usd_mxn, 18.5);
});

test('MXN nunca lleva fx_usd_mxn aunque el usuario tenga tasa configurada', async () => {
  const db = fakeDb({ fxUsdMxn: 18.5 });
  await createLooseExpense(req({ amount: 20, name: 'Renta' }), db, USER_ID);
  assert.equal(db._inserted[0].fx_usd_mxn, null);
});
