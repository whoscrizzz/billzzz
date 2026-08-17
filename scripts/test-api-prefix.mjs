// Tests for the API prefix cutover (worker/src/routes.ts).
// Stage 2 del rename a billzzz-api: /billzzz-api es el único prefijo aceptado.
// /bills-api (el prefijo viejo, stage 1 lo aceptaba en paralelo) debe quedar
// explícitamente rechazado — esto es una regresión intencional, no un bug.
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

test('isApiPath acepta /billzzz-api y rechaza el prefijo viejo /bills-api', () => {
  assert.equal(isApiPath('/billzzz-api/health'), true);
  assert.equal(isApiPath('/bills-api/health'), false);
  assert.equal(isApiPath('/api/health'), false);
  assert.equal(isApiPath('/billzzz-apix/health'), false);
});

test('handleApi resuelve /billzzz-api/health con el health check real', async () => {
  const env = fakeEnv();
  const req = new Request('https://billzzz.whoscrizzz.com/billzzz-api/health');
  const res = await handleApi(req, env, new URL(req.url));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
});

test('handleApi normaliza rutas parametrizadas (calendar feed vía regex) bajo /billzzz-api', async () => {
  const env = fakeEnv();
  const req = new Request(
    'https://billzzz.whoscrizzz.com/billzzz-api/calendar/feed/tok123.ics'
  );
  const res = await handleApi(req, env, new URL(req.url));

  // Token inexistente: lo que importa es que llegue al handler correcto con el
  // parámetro bien extraído (404 de "no encontrado"), no un error de ruteo.
  assert.equal(res.status, 404);
});
