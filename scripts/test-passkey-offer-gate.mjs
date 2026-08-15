// Regresión: la app ofrecía registrar un passkey nuevo en cada login exitoso
// sin revisar si la cuenta ya tenía uno, y VerifyPage.tsx (login por enlace
// mágico) además renderizaba la oferta una segunda vez por su cuenta — dos
// mecanismos independientes que explicaban ~30 passkeys acumulados para un
// solo usuario. createUserSession ahora informa hasPasskey; LoginForm y
// VerifyPage lo usan para no volver a ofrecer el alta cuando ya existe una.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { createUserSession } = await loadTsModule('worker/src/auth.ts');

/** Minimal D1 stand-in for the two statements createUserSession issues. */
function fakeDb({ hasPasskey }) {
  return {
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) {
          stmt.args = args;
          return stmt;
        },
        async first() {
          if (/FROM passkey_credentials/i.test(sql)) return hasPasskey ? { 1: 1 } : null;
          return null;
        },
        async run() {
          return { success: true };
        },
      };
      return stmt;
    },
  };
}

function makeRequest() {
  return new Request('https://bills.example.com/bills-api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

test('createUserSession reports hasPasskey: true when the account already has a credential', async () => {
  const env = { DB: fakeDb({ hasPasskey: true }) };
  const res = await createUserSession(makeRequest(), env, 'user-1', 'a@b.com');
  const body = await res.json();
  assert.equal(body.hasPasskey, true);
});

test('createUserSession reports hasPasskey: false when the account has no credential', async () => {
  const env = { DB: fakeDb({ hasPasskey: false }) };
  const res = await createUserSession(makeRequest(), env, 'user-1', 'a@b.com');
  const body = await res.json();
  assert.equal(body.hasPasskey, false);
});

test('LoginForm only offers a passkey when the account has none', () => {
  const source = readFileSync('src/components/LoginForm.tsx', 'utf8');
  assert.match(
    source,
    /if\s*\(\s*!result\.hasPasskey\s*\)\s*markPasskeyOfferPending\s*\(\s*\)\s*;/,
    'the post-code-login passkey offer must be gated on hasPasskey'
  );
});

test('VerifyPage no longer renders its own inline passkey registration step', () => {
  const source = readFileSync('src/pages/VerifyPage.tsx', 'utf8');
  assert.ok(
    !source.includes('PasskeySetupPrompt'),
    'VerifyPage must route through PostLoginPasskeyOffer instead of offering registration itself — ' +
      'the old inline step fired a second, unconditional offer on top of the shared one'
  );
  assert.match(
    source,
    /if\s*\(\s*!result\.hasPasskey\s*\)\s*markPasskeyOfferPending\s*\(\s*\)\s*;/,
    'the magic-link login passkey offer must be gated on hasPasskey, same as LoginForm'
  );
});

test('PasskeySetupPrompt surfaces a duplicate-credential error instead of closing silently', () => {
  const source = readFileSync('src/components/PasskeySetupPrompt.tsx', 'utf8');
  const match = source.match(/isPasskeyAlreadyRegistered\(err\)\)\s*\{([\s\S]*?)\}/);
  assert.ok(match, 'expected an isPasskeyAlreadyRegistered branch in handleRegister');
  assert.ok(
    !match[1].includes('onDone()'),
    'a duplicate-credential error must not silently dismiss the prompt as if it succeeded'
  );
});
