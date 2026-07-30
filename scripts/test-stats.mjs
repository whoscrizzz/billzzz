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
    due_days: null,
    interval_count: null,
    interval_unit: null,
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

test('quincenal por intervalo (15 días) que vence el 25 de enero avanza al 9 de febrero al pagar', () => {
  const sub = baseSub({
    frequency: 'interval',
    interval_count: 15,
    interval_unit: 'day',
    due_day: 25,
    due_date: '2026-01-25',
  });
  const from = new Date('2026-01-25T12:00:00Z');
  const advanced = advanceDueDateAfterPayment(sub, from);
  assert.equal(advanced.due_date, '2026-02-09');
});

test('due_days [1, 15]: encuentra la siguiente fecha dentro del mes y salta al 1 de marzo pasado el 15', () => {
  const midMonth = baseSub({ due_days: [1, 15] });
  const fromEarly = new Date('2026-02-05T12:00:00Z');
  assert.equal(daysUntilNextDue(midMonth, fromEarly), 10, 'del 5 al 15 de febrero');

  const onFifteenth = baseSub({ due_days: [1, 15], due_day: 15, due_date: '2026-02-15' });
  const advanced = advanceDueDateAfterPayment(onFifteenth, new Date('2026-02-15T12:00:00Z'));
  assert.equal(advanced.due_date, '2026-03-01', 'pasado el 15 de febrero salta al 1 de marzo');
});

test('mensual con ancla el 31 clampa en meses cortos y recupera el 31 en los largos, sin desbordar', () => {
  let sub = baseSub({ frequency: 'monthly', due_day: 31, due_date: '2026-01-31' });
  let advanced = advanceDueDateAfterPayment(sub, new Date('2026-01-31T12:00:00Z'));
  assert.equal(advanced.due_date, '2026-02-28', 'clampa en febrero, no desborda a marzo');
  assert.equal(advanced.due_day, 31, 'conserva el ancla original para el siguiente ciclo');

  sub = baseSub({ frequency: 'monthly', due_day: 31, due_date: advanced.due_date });
  advanced = advanceDueDateAfterPayment(sub, new Date('2026-02-28T12:00:00Z'));
  assert.equal(advanced.due_date, '2026-03-31', 'recupera el 31 en cuanto el mes lo permite');
});
