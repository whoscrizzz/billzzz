// Tests for WebAuthn RP ID / origin resolution.
// Imports the real module (see test-helpers/load-ts-module.mjs): antes este
// archivo reimplementaba getWebAuthnConfig en línea, así que una regresión en
// worker/src/webauthn-config.ts lo dejaba igual de verde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { getWebAuthnConfig, isLocalhostOrigin } = await loadTsModule(
  'worker/src/webauthn-config.ts'
);

/** Adapta la firma real (env, Request) a los tres datos que varían por caso. */
function configFor(appUrl, requestUrl, requestOrigin = null) {
  const request = new Request(requestUrl, {
    headers: requestOrigin ? { Origin: requestOrigin } : {},
  });
  return getWebAuthnConfig({ APP_URL: appUrl ?? '' }, request);
}

test('production resolves rpID and origins from APP_URL', () => {
  const prod = configFor('https://bills.whoscrizzz.com', 'https://bills.whoscrizzz.com/');
  assert.equal(prod.rpID, 'bills.whoscrizzz.com');
  assert.ok(prod.expectedOrigins.includes('https://bills.whoscrizzz.com'));
});

test('local dev resolves rpID to localhost with both Vite and Wrangler ports allowed', () => {
  const local = configFor(null, 'http://localhost:8787/bills-api/health');
  assert.equal(local.rpID, 'localhost');
  for (const o of ['http://localhost:5173', 'http://localhost:8787']) {
    assert.ok(local.expectedOrigins.includes(o), `missing ${o}`);
  }
});

test('trailing slash in APP_URL is stripped from the resolved origin', () => {
  const trailing = configFor('https://bills.whoscrizzz.com/', 'https://x.example/');
  assert.equal(trailing.origin, 'https://bills.whoscrizzz.com');
});

test('local dev accepts a custom port from the request Origin (VITE_PORT/VITE_API_PORT)', () => {
  // .env.local puede mover los puertos por worktree; el Worker no lee ese
  // archivo, así que la lista fija no alcanza y hay que confiar en el Origin.
  const local = configFor(null, 'http://localhost:8787/x', 'http://localhost:8790');
  assert.ok(local.expectedOrigins.includes('http://localhost:8790'));
  assert.ok(local.expectedOrigins.includes('http://localhost:5173'), 'no pierde los fijos');
});

test('production never widens its origin list from the request Origin header', () => {
  const prod = configFor(
    'https://bills.whoscrizzz.com',
    'https://bills.whoscrizzz.com/',
    'https://atacante.example'
  );
  assert.deepEqual(prod.expectedOrigins, ['https://bills.whoscrizzz.com']);
});

test('a non-localhost Origin is ignored even in local dev', () => {
  const local = configFor(null, 'http://localhost:8787/x', 'https://atacante.example');
  assert.ok(!local.expectedOrigins.includes('https://atacante.example'));
});

test('a malformed Origin header does not throw', () => {
  const local = configFor(null, 'http://localhost:8787/x', 'no-es-una-url');
  assert.equal(local.rpID, 'localhost');
  assert.ok(!local.expectedOrigins.includes('no-es-una-url'));
});

test('isLocalhostOrigin solo acepta http(s) apuntando a la máquina local', () => {
  assert.ok(isLocalhostOrigin('http://localhost:5173'));
  assert.ok(isLocalhostOrigin('http://127.0.0.1:8787'));
  assert.ok(!isLocalhostOrigin('https://atacante.example'));
  assert.ok(!isLocalhostOrigin('file://localhost'), 'un esquema no http(s) no cuenta');
  assert.ok(!isLocalhostOrigin('no-es-una-url'));
});
