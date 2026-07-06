// Tests for due-date logic (mirrors src/lib/due-dates.ts). Uses Node's built-in test runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function todayCalendarTs(year, month, date) {
  return Date.UTC(year, month, date);
}

function daysUntilIsoLocalParts(iso, year, month, date) {
  const due = parseIso(iso);
  const today = todayCalendarTs(year, month, date);
  return Math.round((due - today) / 86400000);
}

function daysUntilMonthly(dueDate, from) {
  const todayTs = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const parts = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const day = Number(parts[3]);
  const year = from.getFullYear();
  const month = from.getMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let due = Date.UTC(year, month, Math.min(day, lastDay));
  if (due < todayTs) due = Date.UTC(year, month + 1, Math.min(day, lastDay));
  return Math.round((due - todayTs) / 86400000);
}

function daysUntilMonthlyRespectingStored(dueDate, from) {
  const todayTs = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const storedTs = parseIso(dueDate);
  if (storedTs != null && storedTs >= todayTs) {
    return Math.round((storedTs - todayTs) / 86400000);
  }
  const day = Number(dueDate.slice(8, 10));
  const year = from.getFullYear();
  const month = from.getMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let due = Date.UTC(year, month, Math.min(day, lastDay));
  if (due < todayTs) due = Date.UTC(year, month + 1, Math.min(day, lastDay));
  return Math.round((due - todayTs) / 86400000);
}

function safeUtcDate(year, month, day) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(day, lastDay));
}

function advanceMonthly(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(safeUtcDate(y, m, d)).toISOString().slice(0, 10);
}

test('respects a stored future due date over the recurring day-of-month', () => {
  const from = new Date('2026-06-25T12:00:00Z');
  const days = daysUntilMonthlyRespectingStored('2027-02-01', from);
  assert.ok(days > 200 && days < 230, `expected ~221 days to 2027-02-01, got ${days}`);
});

test('falls back to day-of-month once the stored date is in the past', () => {
  const from = new Date('2026-06-25T12:00:00Z');
  const days = daysUntilMonthlyRespectingStored('2026-06-27', from);
  assert.equal(days, 2);
});

test('computes days until the next monthly occurrence', () => {
  const fromJune = new Date('2026-06-01T12:00:00Z');
  assert.equal(daysUntilMonthly('2026-06-05', fromJune), 4);
});

test('parseIso rejects malformed dates', () => {
  assert.notEqual(parseIso('2026-06-05'), null);
});

test('local calendar date math is timezone-independent', () => {
  assert.equal(daysUntilIsoLocalParts('2026-06-24', 2026, 5, 24), 0, 'today');
  assert.equal(daysUntilIsoLocalParts('2026-06-25', 2026, 5, 24), 1, 'tomorrow');
  // A UTC-style "today" anchored one day ahead would wrongly mark yesterday as overdue.
  assert.equal(daysUntilIsoLocalParts('2026-06-24', 2026, 5, 25), -1, 'utc-style anchor');
});

test('advances a monthly due date by one month, clamping to month length', () => {
  assert.equal(advanceMonthly('2026-06-05'), '2026-07-05');
});
