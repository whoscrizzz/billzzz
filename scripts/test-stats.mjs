// Tests for due-date display logic. Imports the real src/lib/due-dates.ts
// (bundled with esbuild — see test-helpers/load-ts-module.mjs) so a
// regression in the shipped code actually fails these tests, instead of a
// hand-copied reimplementation that can silently drift from what ships.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { daysUntilNextDue, advanceDueDateAfterPayment } = await loadTsModule('src/lib/due-dates.ts');

function baseSub(overrides = {}) {
  return {
    id: 's1',
    frequency: 'monthly',
    due_day: 1,
    due_date: null,
    due_dates: null,
    created_at: '2020-01-01T00:00:00.000Z',
    snoozed_until: null,
    ...overrides,
  };
}

test('respects a stored future due date over the recurring day-of-month', () => {
  const from = new Date('2026-06-25T12:00:00Z');
  const sub = baseSub({ due_day: 1, due_date: '2027-02-01' });
  const days = daysUntilNextDue(sub, from);
  assert.ok(days > 200 && days < 230, `expected ~221 days to 2027-02-01, got ${days}`);
});

test('falls back to day-of-month once the stored date is in the past', () => {
  const from = new Date('2026-06-25T12:00:00Z');
  const sub = baseSub({ due_day: 27, due_date: '2026-06-01' });
  assert.equal(daysUntilNextDue(sub, from), 2);
});

test('computes days until the next monthly occurrence', () => {
  const fromJune = new Date('2026-06-01T12:00:00Z');
  const sub = baseSub({ due_day: 5 });
  assert.equal(daysUntilNextDue(sub, fromJune), 4);
});

test('local calendar date math is timezone-independent (uses device-local calendar day)', () => {
  const today = new Date('2026-06-24T12:00:00');
  const tomorrow = new Date('2026-06-25T12:00:00');
  const subToday = baseSub({ frequency: 'once', due_date: '2026-06-24', due_day: 24 });
  const subTomorrow = baseSub({ frequency: 'once', due_date: '2026-06-25', due_day: 25 });
  assert.equal(daysUntilNextDue(subToday, today), 0, 'today');
  assert.equal(daysUntilNextDue(subTomorrow, today), 1, 'tomorrow');
  assert.equal(daysUntilNextDue(subToday, tomorrow), -1, 'yesterday once "today" has advanced');
});

test('advances a monthly due date by one month, clamping to month length', () => {
  const sub = baseSub({ frequency: 'monthly', due_day: 5, due_date: '2026-06-05' });
  const from = new Date('2026-06-05T12:00:00Z');
  const advanced = advanceDueDateAfterPayment(sub, from);
  assert.equal(advanced.due_date, '2026-07-05');
});
