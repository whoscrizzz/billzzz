import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const worker = (await loadTsModule('worker/src/index.ts')).default;

function env() {
  let dbCalls = 0;
  let assetCalls = 0;
  return {
    MAINTENANCE_MODE: 'true',
    APP_VERSION: 'test',
    DB: {
      prepare() {
        dbCalls++;
        return {
          async first() {
            return { ok: 1 };
          },
        };
      },
      async batch() {
        dbCalls++;
      },
    },
    ASSETS: {
      async fetch() {
        assetCalls++;
        return new Response('app');
      },
    },
    _calls: () => ({ dbCalls, assetCalls }),
  };
}

test('mantenimiento bloquea la API con 503 y Retry-After', async () => {
  const runtime = env();
  const response = await worker.fetch(
    new Request('https://billzzz.test/billzzz-api/subscriptions'),
    runtime
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '300');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await response.json()).error.includes('Migración'), true);
  assert.deepEqual(runtime._calls(), { dbCalls: 0, assetCalls: 0 });
});

test('health sigue disponible e identifica esquema v2 y mantenimiento', async () => {
  const runtime = env();
  const response = await worker.fetch(
    new Request('https://billzzz.test/billzzz-api/health'),
    runtime
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.db_schema_version, 2);
  assert.equal(body.maintenance, true);
  assert.equal(runtime._calls().dbCalls, 1);
});

test('mantenimiento muestra HTML en vez de cargar la SPA y detiene el cron', async () => {
  const runtime = env();
  const response = await worker.fetch(new Request('https://billzzz.test/'), runtime);
  assert.equal(response.status, 503);
  assert.match(await response.text(), /está en mantenimiento/);
  await worker.scheduled({}, runtime);
  assert.deepEqual(runtime._calls(), { dbCalls: 0, assetCalls: 0 });
});
