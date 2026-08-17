// Tests for non-destructive revocation (`users.disabled`, migración 0017).
//
// "Revocado" tiene que significar revocado por TODOS los caminos, no solo el login. Los que
// se escapan son los que no pasan por `getSessionUserId`, porque están diseñados
// precisamente para funcionar sin sesión — y por eso sobreviven a cualquier cambio de
// credenciales:
//
//   - sesiones ya emitidas (duran 90 días)
//   - feed .ics y token de captura (Atajos/Siri): sin autenticar, solo posesión de la URL
//   - tokens de acción de las notificaciones push ya entregadas (hasta 14 días)
//   - login con passkey, que verifica WebAuthn y crea sesión sin tocar el camino del correo
//
// La primera versión de este archivo solo cubría los dos primeros; los otros tres salieron
// en revisión. Cada uno tiene su test aquí para que no se vuelvan a escapar.
// Importa los módulos reales (ver test-helpers/load-ts-module.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { requestMagicLink, getSessionUserId } = await loadTsModule('worker/src/auth.ts');
const { captureExpense } = await loadTsModule('worker/src/capture.ts');
const { mintActionToken, verifyActionToken } = await loadTsModule(
  'worker/src/notification-actions.ts'
);

/**
 * D1 stand-in. `users` lleva su flag `disabled`; las consultas se reconocen por forma, así
 * que un cambio en el SQL que quite el filtro hace fallar el test en vez de pasar de largo.
 */
function fakeDb(users = []) {
  const statements = [];
  return {
    statements,
    inserted(table) {
      return statements.filter((s) => new RegExp(`INSERT INTO ${table}`, 'i').test(s.sql));
    },
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) {
          stmt.args = args;
          return stmt;
        },
        async first() {
          statements.push({ sql, args: stmt.args });
          if (/auth_rate_limits/i.test(sql)) return null; // bajo el límite

          // Lookup por email en el login.
          if (/FROM users WHERE email/i.test(sql)) {
            const found = users.find((u) => u.email === stmt.args[0]);
            if (!found) return null;
            // Respeta el `AND disabled = 0` del SQL real.
            if (/disabled\s*=\s*0/i.test(sql) && found.disabled) return null;
            return { id: found.id };
          }

          // Lookup por capture_token (ruta de Atajos/Siri, sin sesión).
          if (/FROM users WHERE capture_token/i.test(sql)) {
            const found = users.find((u) => u.captureToken === stmt.args[0]);
            if (!found) return null;
            if (/disabled\s*=\s*0/i.test(sql) && found.disabled) return null;
            return { id: found.id };
          }

          // Dueño de una suscripción, para los tokens de acción de las notificaciones.
          if (/FROM subscriptions s JOIN users u/i.test(sql)) {
            const owner = users[0];
            if (!owner) return null;
            const row = { user_id: owner.id, action_token_version: 0 };
            // Solo expone `disabled` si el SELECT realmente lo pidió.
            if (/u\.disabled/i.test(sql)) row.disabled = owner.disabled ? 1 : 0;
            return row;
          }

          // Lookup de sesión (JOIN users) en getSessionUserId.
          if (/FROM sessions/i.test(sql)) {
            const session = users.find((u) => u.token === stmt.args[0]);
            if (!session) return null;
            const row = {
              user_id: session.id,
              expires_at: new Date(Date.now() + 86_400_000).toISOString(),
            };
            // Solo expone `disabled` si el SQL realmente hizo el JOIN a users.
            if (/JOIN users/i.test(sql)) row.disabled = session.disabled ? 1 : 0;
            return row;
          }
          return null;
        },
        async run() {
          statements.push({ sql, args: stmt.args });
          return { success: true };
        },
      };
      return stmt;
    },
  };
}

function loginRequest(email) {
  return new Request('https://bills.example.com/billzzz-api/auth/request-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

function sessionRequest(token) {
  return new Request('https://bills.example.com/billzzz-api/subscriptions', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

const ACTIVO = {
  id: 'u-activo',
  email: 'activo@correo.com',
  token: 't-activo',
  captureToken: 'cap-activo',
  disabled: 0,
};
const REVOCADO = {
  id: 'u-revocado',
  email: 'revocado@correo.com',
  token: 't-revocado',
  captureToken: 'cap-revocado',
  disabled: 1,
};

test('una cuenta revocada no puede pedir enlace de acceso', async () => {
  const db = fakeDb([REVOCADO]);
  const res = await requestMagicLink(loginRequest(REVOCADO.email), { DB: db });
  const body = await res.json();

  assert.equal(body.ok, true, 'no debe delatar que la cuenta existe');
  assert.equal(db.inserted('magic_links').length, 0, 'se emitió un enlace a una cuenta revocada');
});

test('una cuenta activa sigue pudiendo pedirlo', async () => {
  const db = fakeDb([ACTIVO]);
  await requestMagicLink(loginRequest(ACTIVO.email), { DB: db });

  assert.equal(db.inserted('magic_links').length, 1, 'se rompió el login de una cuenta activa');
});

test('revocar invalida las sesiones ya emitidas, no solo el login', async () => {
  // El punto entero de la revocación: sin esto, alguien con sesión viva sigue dentro
  // hasta 90 días después de quitarle el acceso.
  const db = fakeDb([REVOCADO]);
  const userId = await getSessionUserId(sessionRequest(REVOCADO.token), { DB: db });

  assert.equal(userId, null, 'una sesión de cuenta revocada siguió siendo válida');
});

test('la sesión de una cuenta activa no se ve afectada', async () => {
  const db = fakeDb([ACTIVO]);
  const userId = await getSessionUserId(sessionRequest(ACTIVO.token), { DB: db });

  assert.equal(userId, ACTIVO.id, 'se rompió la sesión de una cuenta activa');
});

test('la consulta de sesión hace JOIN a users (sin él no hay revocación posible)', async () => {
  const db = fakeDb([ACTIVO]);
  await getSessionUserId(sessionRequest(ACTIVO.token), { DB: db });

  const sessionQuery = db.statements.find((s) => /FROM sessions/i.test(s.sql));
  assert.match(sessionQuery.sql, /JOIN users/i);
  assert.match(sessionQuery.sql, /disabled/i);
});

// --- Caminos sin sesión ---------------------------------------------------------------

function captureRequest(amount) {
  return new Request('https://bills.example.com/billzzz-api/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
}

test('un Atajo guardado deja de capturar gastos tras revocar', async () => {
  const db = fakeDb([REVOCADO]);
  const res = await captureExpense(captureRequest(120), { DB: db }, REVOCADO.captureToken);

  assert.equal(res.status, 401, 'el capture_token siguió escribiendo tras revocar');
  assert.equal(db.inserted('payment_records').length, 0);
});

test('el Atajo de una cuenta activa sigue funcionando', async () => {
  const db = fakeDb([ACTIVO]);
  const res = await captureExpense(captureRequest(120), { DB: db }, ACTIVO.captureToken);

  assert.notEqual(res.status, 401, 'se rompió la captura de una cuenta activa');
});

test('los botones de una notificación ya entregada dejan de servir tras revocar', async () => {
  // Viven hasta 14 días y no pasan por getSessionUserId — sin el check, alguien revocado
  // seguiría marcando pagos desde una notificación vieja.
  const secret = 'secreto-de-prueba';
  const key = 's-1:2099-01-15:3';
  const token = await mintActionToken(
    { subscriptionId: 's-1', notificationKey: key, actionTokenVersion: 0 },
    secret
  );

  const revocado = await verifyActionToken(token, fakeDb([REVOCADO]), secret);
  assert.equal(revocado, null, 'un token de acción siguió siendo válido tras revocar');

  const activo = await verifyActionToken(token, fakeDb([ACTIVO]), secret);
  assert.equal(activo?.userId, ACTIVO.id, 'se rompieron los botones de una cuenta activa');
});

test('el cron de recordatorios filtra cuentas revocadas', async () => {
  // sendDueReminders (worker/src/reminder-notifications.ts) es otro camino que
  // resuelve usuarios sin pasar por getSessionUserId — es un cron. Ejecutarlo
  // de punta a punta requiere VAPID keys + mock de push; el guard es
  // puramente SQL, así que se comprueba sobre la consulta, mismo criterio que
  // el test de passkeyLoginVerify de abajo.
  const source = await readFile(
    new URL('../worker/src/reminder-notifications.ts', import.meta.url),
    'utf8'
  );
  const dueQuery = source.match(/SELECT r\.\* FROM reminders r[^`]*/);

  assert.ok(dueQuery, 'cambió la consulta que resuelve recordatorios vencidos');
  assert.match(dueQuery[0], /JOIN users u/i, 'sendDueReminders dejó de unir a users');
  assert.match(
    dueQuery[0],
    /u\.disabled\s*=\s*0/,
    'sendDueReminders mandaría push a una cuenta revocada'
  );
  assert.match(
    dueQuery[0],
    /r\.trashed_at IS NULL/,
    'sendDueReminders mandaría push a un recordatorio en la papelera'
  );
});

test('el login con passkey filtra cuentas revocadas', async () => {
  // passkeyLoginVerify necesita una verificación WebAuthn real (challenge + firma del
  // autenticador), demasiado para reproducir aquí. El guard es puramente SQL, así que se
  // comprueba sobre la consulta: es lo único que separa "verificó su passkey" de "obtiene
  // sesión", porque esa ruta nunca toca getSessionUserId.
  const source = await readFile(new URL('../worker/src/passkeys.ts', import.meta.url), 'utf8');
  const userLookup = source.match(/SELECT email FROM users WHERE id = \?[^`]*/);

  assert.ok(userLookup, 'cambió la consulta que resuelve al dueño del passkey');
  assert.match(
    userLookup[0],
    /disabled\s*=\s*0/,
    'passkeyLoginVerify daría sesión a una cuenta revocada'
  );
});
