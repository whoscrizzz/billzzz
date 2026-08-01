// Tests for src/lib/trash.ts — bundled with esbuild (see
// test-helpers/load-ts-module.mjs) so a regression in the shipped code
// actually fails these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { daysRemainingInTrash, TRASH_RETENTION_DAYS } = await loadTsModule('src/lib/trash.ts');

test('recién trashed muestra los 30 días completos', () => {
  const now = new Date('2026-07-31T12:00:00.000Z');
  const trashedAt = now.toISOString();
  assert.equal(daysRemainingInTrash(trashedAt, now), TRASH_RETENTION_DAYS);
});

test('a 29 días transcurridos queda 1 día', () => {
  const trashedAt = new Date('2026-07-01T12:00:00.000Z');
  const now = new Date('2026-07-30T12:00:00.000Z');
  assert.equal(daysRemainingInTrash(trashedAt.toISOString(), now), 1);
});

test('más allá de 30 días transcurridos no baja de 0', () => {
  const trashedAt = new Date('2026-01-01T00:00:00.000Z');
  const now = new Date('2026-07-31T00:00:00.000Z');
  assert.equal(daysRemainingInTrash(trashedAt.toISOString(), now), 0);
});
