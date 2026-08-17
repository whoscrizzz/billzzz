// Tests for dual API-prefix dispatch (worker/src/routes.ts).
// Stage 1 del rename a billzzz-api: /billzzz-api debe resolver exactamente
// igual que /bills-api sin tocar ninguno de los ~43 sitios de match del
// archivo — normalizeApiPath() reescribe el pathname a la entrada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { isApiPath, handleApi } = await loadTsModule('worker/src/routes.ts');

function fakeEnv() {
  return {
    DB: {
      prepare() {
        return {
          bind() {
            return this;
          },
          first: async () => null,
          all: async () => ({ results: [] }),
        };
      },
    },
    APP_VERSION: 'test',
    VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_KEY: 'priv',
  };
}

async function bodyWithoutTime(res) {
  const body = await res.json();
  delete body.time;
  return body;
}

test('isApiPath acepta /bills-api y /billzzz-api, rechaza otros prefijos', () => {
  assert.equal(isApiPath('/bills-api/health'), true);
  assert.equal(isApiPath('/billzzz-api/health'), true);
  assert.equal(isApiPath('/api/health'), false);
  assert.equal(isApiPath('/billzzz-apix/health'), false);
});

test('handleApi con /billzzz-api/health responde igual que /bills-api/health', async () => {
  const env = fakeEnv();

  const oldReq = new Request('https://billzzz.whoscrizzz.com/bills-api/health');
  const oldUrl = new URL(oldReq.url);
  const oldRes = await handleApi(oldReq, env, oldUrl);

  const newReq = new Request('https://billzzz.whoscrizzz.com/billzzz-api/health');
  const newUrl = new URL(newReq.url);
  const newRes = await handleApi(newReq, env, newUrl);

  assert.equal(newRes.status, oldRes.status);
  assert.deepEqual(await bodyWithoutTime(newRes), await bodyWithoutTime(oldRes));
});

test('handleApi normaliza también rutas parametrizadas (calendar feed vía regex)', async () => {
  const env = fakeEnv();

  const oldReq = new Request('https://billzzz.whoscrizzz.com/bills-api/calendar/feed/tok123.ics');
  const oldRes = await handleApi(oldReq, env, new URL(oldReq.url));

  const newReq = new Request(
    'https://billzzz.whoscrizzz.com/billzzz-api/calendar/feed/tok123.ics'
  );
  const newRes = await handleApi(newReq, env, new URL(newReq.url));

  // Token inexistente en ambos casos: lo que importa es que ambos lleguen al
  // mismo handler con el mismo parámetro extraído (mismo 404), no el 200.
  assert.equal(newRes.status, oldRes.status);
  assert.equal(newRes.status, 404);
});
