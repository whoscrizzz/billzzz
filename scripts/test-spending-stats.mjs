// Tests for src/lib/spending-stats.ts — bundled with esbuild (see
// test-helpers/load-ts-module.mjs) so a regression in the shipped code
// actually fails these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { monthlyEquivalent } = await loadTsModule('src/lib/spending-stats.ts');

function baseSub(overrides = {}) {
  return {
    id: 's1',
    name: 'Renta',
    amount: 100,
    currency: 'MXN',
    frequency: 'monthly',
    due_day: 5,
    due_date: '2026-02-05',
    due_dates: null,
    due_days: null,
    interval_count: null,
    interval_unit: null,
    category: null,
    created_at: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('el total del mes usa el monto propio de cada DueDateEntry, no el monto base', () => {
  const sub = baseSub({
    due_dates: JSON.stringify([
      { date: '2026-02-05', amount: 150 },
      { date: '2026-02-20' },
    ]),
  });
  // 150 (override de la primera fecha) + 100 (la segunda cae al monto base)
  assert.equal(monthlyEquivalent(sub, 2026, 1), 250);
});
