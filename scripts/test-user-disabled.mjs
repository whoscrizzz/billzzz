// Tests for non-destructive revocation (`users.disabled`, migración 0017).
//
// "Revocado" tiene que significar revocado por todos los caminos, no solo el login. Un
// usuario deshabilitado conserva sus datos, pero no debe poder: iniciar sesión, seguir
// usando una sesión ya emitida (duran 90 días), ni leer su feed .ics — que no está
// autenticado y por tanto sobreviviría a cualquier cambio de credenciales.
// Importa los módulos reales (ver test-helpers/load-ts-module.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { requestMagicLink, getSessionUserId } = await loadTsModule('worker/src/auth.ts');

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
  return new Request('https://bills.example.com/bills-api/auth/request-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

function sessionRequest(token) {
  return new Request('https://bills.example.com/bills-api/subscriptions', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

const ACTIVO = { id: 'u-activo', email: 'activo@correo.com', token: 't-activo', disabled: 0 };
const REVOCADO = {
  id: 'u-revocado',
  email: 'revocado@correo.com',
  token: 't-revocado',
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
