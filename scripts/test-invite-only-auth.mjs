// Tests for invite-only registration (worker/src/auth.ts requestMagicLink).
//
// Two properties are load-bearing for a private deployment and are asserted here:
//   1. Logging in never creates an account — only `npm run invite` does.
//   2. No response ever carries a usable login token, in any environment. There is
//      deliberately no dev-only branch that echoes one: local dev reads the pending link
//      out of D1 (`npm run dev:link`) precisely so no such branch has to exist.
// Imports the real module (see test-helpers/load-ts-module.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { requestMagicLink } = await loadTsModule('worker/src/auth.ts');

/**
 * Minimal D1 stand-in covering the three statements requestMagicLink issues: the
 * rate-limit UPSERT, the users lookup, and the magic_links INSERT. Records every
 * statement so a test can assert what was (or wasn't) written.
 */
function fakeDb(knownEmails = []) {
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
          // Returning null from the rate-limit UPSERT means "under the cap".
          if (/auth_rate_limits/i.test(sql)) return null;
          if (/FROM users WHERE email/i.test(sql)) {
            return knownEmails.includes(stmt.args[0]) ? { id: 'user-1' } : null;
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

function makeRequest(url, email) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

const PROD_URL = 'https://bills.example.com/billzzz-api/auth/request-link';
const LOCAL_URL = 'http://127.0.0.1:8787/billzzz-api/auth/request-link';

/** Stubs the Resend call so the "email configured" path can run offline. */
async function withStubbedFetch(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test('an unknown address never gets an account or a magic link', async () => {
  const db = fakeDb([]);
  const env = { DB: db, APP_URL: 'https://bills.example.com' };

  const res = await requestMagicLink(makeRequest(PROD_URL, 'desconocido@correo.com'), env);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(db.inserted('users').length, 0, 'logging in must not provision an account');
  assert.equal(db.inserted('magic_links').length, 0, 'no link may be issued to a stranger');
  assert.ok(!body.verifyUrl, 'response leaked a login URL');
  assert.ok(!body.shortCode, 'response leaked a login code');
});

test('an invited address does get a magic link', async () => {
  const db = fakeDb(['invitado@correo.com']);
  const env = {
    DB: db,
    APP_URL: 'https://bills.example.com',
    RESEND_API_KEY: 'test-key',
    EMAIL_FROM: 'Bills <bills@example.com>',
  };

  await withStubbedFetch(() => requestMagicLink(makeRequest(PROD_URL, 'invitado@correo.com'), env));

  assert.equal(db.inserted('magic_links').length, 1, 'invited user should receive a link');
});

test('known and unknown addresses are indistinguishable from the response', async () => {
  const env = (db) => ({
    DB: db,
    APP_URL: 'https://bills.example.com',
    RESEND_API_KEY: 'test-key',
    EMAIL_FROM: 'Bills <bills@example.com>',
  });

  const known = await withStubbedFetch(async () =>
    (
      await requestMagicLink(makeRequest(PROD_URL, 'invitado@correo.com'), env(fakeDb(['invitado@correo.com'])))
    ).json()
  );
  const unknown = await withStubbedFetch(async () =>
    (await requestMagicLink(makeRequest(PROD_URL, 'desconocido@correo.com'), env(fakeDb([])))).json()
  );

  assert.deepEqual(unknown, known, 'response shape must not reveal who has an account');
});

test('production without an email provider errors instead of handing out a token', async () => {
  const db = fakeDb(['invitado@correo.com']);
  const env = { DB: db, APP_URL: 'https://bills.example.com' }; // RESEND_API_KEY absent

  const res = await requestMagicLink(makeRequest(PROD_URL, 'invitado@correo.com'), env);
  const body = await res.json();

  assert.equal(res.status, 503);
  assert.ok(!body.verifyUrl, 'a misconfigured production deploy leaked a login URL');
  assert.ok(!body.shortCode, 'a misconfigured production deploy leaked a login code');
});

test('a loopback request is not a way to get a token either', async () => {
  // Regression guard: an earlier revision gated the token echo on the request host. That
  // is unusable as a dev signal here — `wrangler dev` rewrites both request.url and the
  // Host header to the custom_domain from wrangler.jsonc, so a "localhost" request is
  // indistinguishable from production inside the Worker. Nothing may depend on it again.
  const db = fakeDb(['invitado@correo.com']);
  const env = { DB: db }; // no RESEND_API_KEY — the local dev setup

  const res = await requestMagicLink(makeRequest(LOCAL_URL, 'invitado@correo.com'), env);
  const body = await res.json();

  assert.ok(!body.verifyUrl, 'a loopback request got a login URL');
  assert.ok(!body.shortCode, 'a loopback request got a login code');
});

test('a successful send returns no token material', async () => {
  const db = fakeDb(['invitado@correo.com']);
  const env = {
    DB: db,
    APP_URL: 'https://bills.example.com',
    RESEND_API_KEY: 'test-key',
    EMAIL_FROM: 'Bills <bills@example.com>',
  };

  const body = await withStubbedFetch(async () =>
    (await requestMagicLink(makeRequest(PROD_URL, 'invitado@correo.com'), env)).json()
  );

  assert.deepEqual(Object.keys(body).sort(), ['message', 'ok'], 'response gained a new field');
});
