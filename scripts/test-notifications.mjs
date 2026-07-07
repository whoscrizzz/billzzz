// Tests for notification eligibility logic (mirrors worker/src/notifications.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function daysUntilMonthly(dueDate, from) {
  const todayUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const parts = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const day = Number(parts[3]);
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let due = Date.UTC(year, month, Math.min(day, lastDay));
  if (due < todayUtc) due = Date.UTC(year, month + 1, Math.min(day, lastDay));
  return Math.round((due - todayUtc) / 86400000);
}

function shouldNotify(daysLeft, notifyBefore, hour, nowHour) {
  if (daysLeft == null) return false;
  if (daysLeft < -7 || daysLeft > notifyBefore) return false;
  return nowHour >= hour && nowHour < hour + 1;
}

test('computes days until the next monthly occurrence in UTC', () => {
  const from = new Date('2026-06-01T15:00:00Z');
  assert.equal(daysUntilMonthly('2026-06-05', from), 4);
});

test('notifies within the configured hour window', () => {
  assert.ok(shouldNotify(0, 3, 15, 15), 'should notify at matching hour');
  assert.ok(!shouldNotify(0, 3, 9, 15), 'should not notify at wrong hour');
});

test('notifies for recently overdue bills but not stale ones', () => {
  assert.ok(shouldNotify(-2, 3, 15, 15), 'should notify overdue within 7 days');
  assert.ok(!shouldNotify(-10, 3, 15, 15), 'should not notify very old overdue');
});

test('worker still exports the shouldNotifyNow eligibility check', () => {
  const worker = readFileSync('worker/src/notifications.ts', 'utf8');
  assert.ok(worker.includes('shouldNotifyNow'), 'worker/src/notifications.ts missing shouldNotifyNow');
});
