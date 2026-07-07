// Tests for WebAuthn RP ID / origin resolution (mirrors worker/src/webauthn-config.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';

function appOrigin(envAppUrl, requestUrl) {
  if (envAppUrl) return envAppUrl.replace(/\/$/, '');
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}

function getWebAuthnConfig(envAppUrl, requestUrl) {
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
