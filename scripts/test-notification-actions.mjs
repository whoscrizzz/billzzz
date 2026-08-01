// Tests for the Fase 6a action-token mechanism (worker/src/notification-actions.ts)
// — mark-paid/snooze/undo from the Service Worker, which has no session.
// Imports the real module (see test-helpers/load-ts-module.mjs) so a
// regression in the shipped code actually fails these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { mintActionToken, resolveActionAuth, checkUndoState } = await loadTsModule(
  'worker/src/notification-actions.ts'
);

const SECRET = 'test-secret-not-real';
const NOTIFICATION_KEY = 'sub-1:2026-08-05:0';

/** Fake D1Database — solo cubre el único SELECT que resolveActionAuth hace
 * (subscription -> user_id + action_token_version actual). */
function fakeDb({ userId = 'user-1', actionTokenVersion = 0 } = {}) {
  return {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return { user_id: userId, action_token_version: actionTokenVersion };
        },
      };
    },
  };
}

test('token válido + action_token_version sin cambios → autoriza la acción pedida', async () => {
  const token = await mintActionToken(
    { subscriptionId: 'sub-1', notificationKey: NOTIFICATION_KEY, actionTokenVersion: 0 },
    SECRET
  );
  const auth = await resolveActionAuth(token, fakeDb({ actionTokenVersion: 0 }), SECRET, 'sub-1', 'pay');
  assert.equal(auth.ok, true);
  if (auth.ok) {
    assert.equal(auth.userId, 'user-1');
    assert.equal(auth.notificationKey, NOTIFICATION_KEY);
  }
});

test('action_token_version vieja (sesión revocada después de emitir el token) → 401', async () => {
  const token = await mintActionToken(
    { subscriptionId: 'sub-1', notificationKey: NOTIFICATION_KEY, actionTokenVersion: 0 },
    SECRET
  );
  const auth = await resolveActionAuth(token, fakeDb({ actionTokenVersion: 1 }), SECRET, 'sub-1', 'pay');
  assert.deepEqual(auth, { ok: false, status: 401 });
});

test('token válido pero para otra suscripción → 403, no acceso genérico a la cuenta', async () => {
  const token = await mintActionToken(
    { subscriptionId: 'sub-1', notificationKey: NOTIFICATION_KEY, actionTokenVersion: 0 },
    SECRET
  );
  const auth = await resolveActionAuth(token, fakeDb(), SECRET, 'sub-OTRA', 'pay');
  assert.deepEqual(auth, { ok: false, status: 403 });
});

test('token vencido (nextDue + 14 días ya pasó) → 401', async () => {
  const oldKey = 'sub-1:2000-01-01:0';
  const token = await mintActionToken(
    { subscriptionId: 'sub-1', notificationKey: oldKey, actionTokenVersion: 0 },
    SECRET
  );
  const auth = await resolveActionAuth(token, fakeDb(), SECRET, 'sub-1', 'pay');
  assert.deepEqual(auth, { ok: false, status: 401 });
});

test('token alterado (firma no matchea) → 401', async () => {
  const token = await mintActionToken(
    { subscriptionId: 'sub-1', notificationKey: NOTIFICATION_KEY, actionTokenVersion: 0 },
    SECRET
  );
  const tampered = token.slice(0, -2) + 'xx';
  const auth = await resolveActionAuth(tampered, fakeDb(), SECRET, 'sub-1', 'pay');
  assert.deepEqual(auth, { ok: false, status: 401 });
});

function actionRow(overrides = {}) {
  return {
    id: NOTIFICATION_KEY,
    user_id: 'user-1',
    subscription_id: 'sub-1',
    action: 'pay',
    result_payment_id: 'pay-1',
    prev_snapshot: '{}',
    post_action_updated_at: '2026-08-05T09:00:00.000Z',
    undone_at: null,
    created_at: '2026-08-05T09:00:00.000Z',
    ...overrides,
  };
}

test('bill sin cambios desde la acción → el undo puede aplicarse', () => {
  assert.equal(checkUndoState(actionRow(), '2026-08-05T09:00:00.000Z'), 'ok');
});

test('bill cambiado por otra vía después de la acción → conflicto (la ruta responde 409)', () => {
  // El usuario editó el pago desde la app entre el mark-paid y el undo —
  // updated_at ya no coincide con lo que la acción dejó.
  assert.equal(checkUndoState(actionRow(), '2026-08-05T10:30:00.000Z'), 'conflict');
});

test('undo ya aplicado antes → no-op idempotente, no se trata como conflicto', () => {
  const row = actionRow({ undone_at: '2026-08-05T09:05:00.000Z' });
  assert.equal(checkUndoState(row, '2026-08-05T09:00:00.000Z'), 'already-undone');
});

test('fila inexistente → not-found', () => {
  assert.equal(checkUndoState(null, '2026-08-05T09:00:00.000Z'), 'not-found');
});

// El Bearer normal (app en foreground) no se toca en este cambio: solo se
// agrega un fallback antes del gate genérico. Guarda de regresión por texto
// fuente — igual que test-notifications.mjs para lo que necesita contexto
// real de request/D1 en vez de una función pura.
test('routes.ts sigue cayendo a getSessionUserId cuando no llega X-Action-Token', () => {
  const routes = readFileSync('worker/src/routes.ts', 'utf8');
  assert.ok(
    routes.includes("const actionTokenHeader = request.headers.get('X-Action-Token')"),
    'el header nuevo debe leerse aparte de Authorization, nunca reemplazarlo'
  );
  assert.ok(
    (routes.match(/const sessionUserId = await getSessionUserId\(request, env\);/g) ?? []).length === 3,
    'mark-paid/snooze/undo deben caer los tres a la sesión normal cuando no hay token de acción'
  );
});

test('el token de acción nunca se loguea completo', () => {
  const src = readFileSync('worker/src/notification-actions.ts', 'utf8');
  assert.ok(
    !/console\.(log|error)\([^)]*\btoken\b/.test(src),
    'no debe haber logging directo de la variable `token`'
  );
});
