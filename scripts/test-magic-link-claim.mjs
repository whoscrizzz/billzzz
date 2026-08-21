// Regresion: un magic link/codigo debe ser de un solo uso real. El Worker debe
// reclamar la fila atomica via UPDATE ... used_at IS NULL ... RETURNING antes
// de crear la sesion; un SELECT previo seguido de UPDATE permite dobles sesiones
// bajo requests concurrentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { verifyMagicLink, verifyMagicLinkCode } = await loadTsModule('worker/src/auth.ts');

const EMAIL = 'invitado@correo.com';
const TOKEN = 'magic-token-1';
const CODE = '123456';

function fakeDb() {
  const link = {
    token: TOKEN,
    email: EMAIL,
    short_code: CODE,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: null,
  };
  const sessions = [];
  const statements = [];

  return {
    statements,
    sessions,
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) {
          stmt.args = args;
          return stmt;
        },
        async first() {
          statements.push({ op: 'first', sql, args: stmt.args });

          if (/auth_rate_limits/i.test(sql)) return null;

          if (/UPDATE magic_links/i.test(sql) && /RETURNING/i.test(sql)) {
            const isTokenClaim = /WHERE token = \?/i.test(sql) && stmt.args[0] === link.token;
            const isCodeClaim =
              /WHERE email = \? AND short_code = \?/i.test(sql) &&
              stmt.args[0] === link.email &&
              stmt.args[1] === link.short_code;
            if (!link.used_at && (isTokenClaim || isCodeClaim)) {
              link.used_at = new Date().toISOString();
              return { token: link.token, email: link.email, expires_at: link.expires_at };
            }
            return null;
          }

          if (/FROM users WHERE email/i.test(sql)) {
            return stmt.args[0] === EMAIL ? { id: 'user-1' } : null;
          }

          if (/FROM passkey_credentials/i.test(sql)) return null;
          return null;
        },
        async run() {
          statements.push({ op: 'run', sql, args: stmt.args });
          if (/INSERT INTO sessions/i.test(sql)) {
            sessions.push({ token: stmt.args[0], id: stmt.args[1], user_id: stmt.args[2] });
          }
          return { success: true };
        },
      };
      return stmt;
    },
  };
}

function tokenRequest() {
  return new Request('https://bills.example.com/billzzz-api/auth/verify', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': '127.0.0.1' },
  });
}

function codeRequest() {
  return new Request('https://bills.example.com/billzzz-api/auth/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '127.0.0.1' },
    body: JSON.stringify({ email: EMAIL, code: CODE }),
  });
}

test('verifyMagicLink reclama el token una sola vez antes de crear sesion', async () => {
  const db = fakeDb();
  const first = await verifyMagicLink(tokenRequest(), { DB: db }, TOKEN);
  const second = await verifyMagicLink(tokenRequest(), { DB: db }, TOKEN);

  assert.equal(first.status, 200);
  assert.equal(second.status, 410);
  assert.equal(db.sessions.length, 1, 'el mismo token creo mas de una sesion');
  assert.ok(
    db.statements.some(
      (s) =>
        /UPDATE magic_links/i.test(s.sql) &&
        /used_at IS NULL/i.test(s.sql) &&
        /RETURNING/i.test(s.sql)
    ),
    'la verificacion no reclamo magic_links con UPDATE atomico'
  );
});

test('verifyMagicLinkCode reclama el codigo una sola vez antes de crear sesion', async () => {
  const db = fakeDb();
  const first = await verifyMagicLinkCode(codeRequest(), { DB: db });
  const second = await verifyMagicLinkCode(codeRequest(), { DB: db });

  assert.equal(first.status, 200);
  assert.equal(second.status, 404);
  assert.equal(db.sessions.length, 1, 'el mismo codigo creo mas de una sesion');
  assert.ok(
    db.statements.some(
      (s) =>
        /UPDATE magic_links/i.test(s.sql) &&
        /used_at IS NULL/i.test(s.sql) &&
        /RETURNING/i.test(s.sql)
    ),
    'la verificacion por codigo no reclamo magic_links con UPDATE atomico'
  );
});
