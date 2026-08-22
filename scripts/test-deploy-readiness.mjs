import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeMigrationsDir,
  deployReadiness,
  REQUIRED_MIGRATIONS_DIR,
  WORKER_DB_SCHEMA_VERSION,
} from './check-deploy-readiness.mjs';

test('bloquea el Worker v2 mientras producción continúa ligada a migrations-v1', () => {
  const result = deployReadiness(`{
    "d1_databases": [{
      "binding": "DB",
      "migrations_dir": "migrations-v1"
    }]
  }`);
  assert.deepEqual(result, {
    deployAllowed: false,
    migrationsDir: 'migrations-v1',
    requiredMigrationsDir: REQUIRED_MIGRATIONS_DIR,
    workerSchemaVersion: WORKER_DB_SCHEMA_VERSION,
  });
});

test('habilita el deploy después de que el binding apunta a la línea v2', () => {
  assert.equal(
    deployReadiness(`{
      "d1_databases": [{
        "binding": "DB",
        "migrations_dir": "migrations"
      }]
    }`).deployAllowed,
    true
  );
});

test('falla cerrado si no puede resolver el binding D1', () => {
  assert.throws(() => activeMigrationsDir('{ "d1_databases": [] }'), /binding DB/);
});
