// Tests for WebAuthn RP ID / origin resolution (mirrors worker/src/webauthn-config.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';

function appOrigin(envAppUrl, requestUrl) {
  if (envAppUrl) return envAppUrl.replace(/\/$/, '');
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}

function isLocalhostOrigin(value) {
  try {
    const { hostname, protocol } = new URL(value);
    return (
      (protocol === 'http:' || protocol === 'https:') &&
      (hostname === 'localhost' || hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

function getWebAuthnConfig(envAppUrl, requestUrl, requestOrigin = null) {
  const origin = appOrigin(envAppUrl, requestUrl);
  const url = new URL(origin);
  const hostname = url.hostname;

  let rpID;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    rpID = 'localhost';
  } else {
    rpID = hostname;
  }

  const expectedOrigins = new Set([origin]);
  if (rpID === 'localhost') {
    expectedOrigins.add('http://localhost:5173');
    expectedOrigins.add('http://localhost:8787');
    expectedOrigins.add('http://127.0.0.1:5173');
    expectedOrigins.add('http://127.0.0.1:8787');
    if (requestOrigin && isLocalhostOrigin(requestOrigin)) {
      expectedOrigins.add(requestOrigin);
    }
  }

  return { rpName: 'Bills', rpID, origin, expectedOrigins: [...expectedOrigins] };
}

test('production resolves rpID and origins from APP_URL', () => {
  const prod = getWebAuthnConfig('https://bills.whoscrizzz.com', 'https://bills.whoscrizzz.com/');
  assert.equal(prod.rpID, 'bills.whoscrizzz.com');
  assert.ok(prod.expectedOrigins.includes('https://bills.whoscrizzz.com'));
});

test('local dev resolves rpID to localhost with both Vite and Wrangler ports allowed', () => {
  const local = getWebAuthnConfig(null, 'http://localhost:8787/bills-api/health');
  assert.equal(local.rpID, 'localhost');
  for (const o of ['http://localhost:5173', 'http://localhost:8787']) {
    assert.ok(local.expectedOrigins.includes(o), `missing ${o}`);
  }
});

test('trailing slash in APP_URL is stripped from the resolved origin', () => {
  const trailing = getWebAuthnConfig('https://bills.whoscrizzz.com/', 'https://x.example/');
  assert.equal(trailing.origin, 'https://bills.whoscrizzz.com');
});

test('local dev accepts a custom port from the request Origin (VITE_PORT/VITE_API_PORT)', () => {
  // .env.local puede mover los puertos por worktree; el Worker no lee ese
  // archivo, así que la lista fija no alcanza y hay que confiar en el Origin.
  const local = getWebAuthnConfig(null, 'http://localhost:8787/x', 'http://localhost:8790');
  assert.ok(local.expectedOrigins.includes('http://localhost:8790'));
  assert.ok(local.expectedOrigins.includes('http://localhost:5173'), 'no pierde los fijos');
});

test('production never widens its origin list from the request Origin header', () => {
  const prod = getWebAuthnConfig(
    'https://bills.whoscrizzz.com',
    'https://bills.whoscrizzz.com/',
    'https://atacante.example'
  );
  assert.deepEqual(prod.expectedOrigins, ['https://bills.whoscrizzz.com']);
});

test('a non-localhost Origin is ignored even in local dev', () => {
  const local = getWebAuthnConfig(null, 'http://localhost:8787/x', 'https://atacante.example');
  assert.ok(!local.expectedOrigins.includes('https://atacante.example'));
});

test('a malformed Origin header does not throw', () => {
  const local = getWebAuthnConfig(null, 'http://localhost:8787/x', 'no-es-una-url');
  assert.equal(local.rpID, 'localhost');
  assert.ok(!local.expectedOrigins.includes('no-es-una-url'));
});
