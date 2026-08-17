// Tests for Fase 7b — captura rápida de gastos (worker/src/capture.ts).
// Imports the real module (see test-helpers/load-ts-module.mjs) so a
// regression in the shipped code actually fails these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { captureExpense } = await loadTsModule('worker/src/capture.ts');

const VALID_TOKEN = 'token-valido';

/** Fake D1Database cubriendo lo que toca captureExpense: el UPSERT del rate
 * limit, el SELECT de users por capture_token, el SELECT de subscriptions
 * (solo cuando viene subscription_id) y el INSERT del payment_record. */
function fakeDb({ token = VALID_TOKEN, rateLimited = false, subs = [] } = {}) {
  const inserted = [];
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
          if (this._sql.includes('auth_rate_limits')) {
            // checkRateLimit lee attempts/window_start del RETURNING.
            return rateLimited
              ? { attempts: 999, window_start: new Date().toISOString() }
              : { attempts: 1, window_start: new Date().toISOString() };
          }
          if (this._sql.includes('FROM users')) {
            return this._args[0] === token ? { id: 'user-1' } : null;
          }
          if (this._sql.includes('FROM subscriptions')) {
            return subs.find((s) => s.id === this._args[0]) ?? null;
          }
          return null;
        },
        async run() {
          if (this._sql.includes('INSERT INTO payment_records')) {
            const [id, user_id, subscription_id, amount, currency, paid_at, notes, name, category] =
              this._args;
            inserted.push({
              id,
              user_id,
              subscription_id,
              amount,
              currency,
              paid_at,
              notes,
              name,
              category,
            });
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };
}

const req = (body) =>
  new Request('https://x.test/billzzz-api/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('token desconocido → 401, sin escribir nada', async () => {
  const db = fakeDb();
  const res = await captureExpense(req({ amount: 100 }), { DB: db }, 'token-que-no-existe');
  assert.equal(res.status, 401);
  assert.equal(db._inserted.length, 0);
});

test('gasto suelto: sin subscription_id guarda name/category propios', async () => {
  const db = fakeDb();
  const res = await captureExpense(
    req({ amount: 320, name: 'Comida', category: 'Comida' }),
    { DB: db },
    VALID_TOKEN
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.paymentId);

  assert.equal(db._inserted.length, 1);
  const row = db._inserted[0];
  assert.equal(row.subscription_id, null, 'un gasto suelto no cuelga de ninguna suscripción');
  assert.equal(row.name, 'Comida');
  assert.equal(row.category, 'Comida');
  assert.equal(row.amount, 320);
  assert.equal(row.currency, 'MXN', 'moneda por defecto');
});

test('con subscription_id válido: name/category quedan NULL (se heredan por JOIN)', async () => {
  const db = fakeDb({ subs: [{ id: 'sub-1' }] });
  const res = await captureExpense(
    req({ amount: 99, subscription_id: 'sub-1', name: 'ignorado', category: 'ignorada' }),
    { DB: db },
    VALID_TOKEN
  );
  assert.equal(res.status, 200);
  const row = db._inserted[0];
  assert.equal(row.subscription_id, 'sub-1');
  assert.equal(row.name, null, 'no se duplica el nombre: lo manda la suscripción');
  assert.equal(row.category, null);
});

test('subscription_id de otro usuario (o inexistente) → 404, sin escribir', async () => {
  const db = fakeDb({ subs: [] });
  const res = await captureExpense(
    req({ amount: 50, subscription_id: 'sub-ajena' }),
    { DB: db },
    VALID_TOKEN
  );
  assert.equal(res.status, 404);
  assert.equal(db._inserted.length, 0);
});

test('montos inválidos → 400, sin escribir', async () => {
  for (const amount of [-1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
    const db = fakeDb();
    const res = await captureExpense(req({ amount }), { DB: db }, VALID_TOKEN);
    assert.equal(res.status, 400, `amount=${String(amount)} debe rechazarse`);
    assert.equal(db._inserted.length, 0);
  }
});

test('paid_at inválido → 400; paid_at válido se respeta', async () => {
  const bad = fakeDb();
  assert.equal(
    (await captureExpense(req({ amount: 10, paid_at: 'no-es-fecha' }), { DB: bad }, VALID_TOKEN))
      .status,
    400
  );

  const ok = fakeDb();
  await captureExpense(
    req({ amount: 10, paid_at: '2026-07-04T12:00:00.000Z' }),
    { DB: ok },
    VALID_TOKEN
  );
  assert.equal(ok._inserted[0].paid_at, '2026-07-04T12:00:00.000Z');
});

test('rate limit agotado → 429 con retryAfterSec, sin escribir', async () => {
  const db = fakeDb({ rateLimited: true });
  const res = await captureExpense(req({ amount: 10 }), { DB: db }, VALID_TOKEN);
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.ok(typeof body.retryAfterSec === 'number');
  assert.equal(db._inserted.length, 0);
});

// Guarda de regresión: el rate limit debe evaluarse ANTES de resolver el
// usuario, para que un token inválido tampoco pueda sondear sin tope.
test('el rate limit se aplica antes del lookup de usuario', () => {
  const src = readFileSync('worker/src/capture.ts', 'utf8');
  const rlIndex = src.indexOf('checkRateLimit');
  const userIndex = src.indexOf('FROM users WHERE capture_token');
  assert.ok(rlIndex > 0 && userIndex > 0);
  assert.ok(rlIndex < userIndex, 'checkRateLimit debe ir antes del SELECT de users');
});

test('el token de captura nunca se loguea', () => {
  const src = readFileSync('worker/src/capture.ts', 'utf8');
  assert.ok(!/console\.(log|error|warn)/.test(src), 'capture.ts no debe loguear nada');
});
