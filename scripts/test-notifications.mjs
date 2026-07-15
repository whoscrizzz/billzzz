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

// Mirrors worker/src/timezone.ts's getDateInTimeZone.
function dateInTimeZone(date, timeZone = 'America/Mexico_City') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year').value);
  const month = Number(parts.find((p) => p.type === 'month').value);
  const day = Number(parts.find((p) => p.type === 'day').value);
  return Date.UTC(year, month - 1, day);
}

// Mirrors worker/src/due-dates.ts's daysUntilNextDue for a fixed due_date,
// anchored to the notify timezone instead of raw UTC.
function daysUntilFixedDate(dueDate, from) {
  const todayUtc = dateInTimeZone(from);
  const [y, m, d] = dueDate.split('-').map(Number);
  const due = Date.UTC(y, m - 1, d);
  return Math.round((due - todayUtc) / 86400000);
}

function shouldNotify(daysLeft, notifyBefore, hour, nowHour) {
  if (daysLeft == null) return false;
  if (daysLeft < -7 || daysLeft > notifyBefore) return false;
  return nowHour >= hour && nowHour < hour + 1;
}

// Mirrors worker/src/notification-health.ts's resolveNotificationHealth.
function resolveNotificationHealth(attempts) {
  if (attempts.length === 0) {
    return { last_attempt_at: null, last_status: null, consecutive_failures: 0 };
  }
  let consecutiveFailures = 0;
  for (const attempt of attempts) {
    if (attempt.status === 'sent') break;
    consecutiveFailures++;
  }
  return {
    last_attempt_at: attempts[0].created_at,
    last_status: attempts[0].status,
    consecutive_failures: consecutiveFailures,
  };
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

test('day math for an evening notify_hour agrees with Mexico City, not raw UTC', () => {
  // 2026-06-10T02:00:00Z is 2026-06-09 20:00 in Mexico City (fixed UTC-6, no DST).
  // A bill due 2026-06-09 is due "today" (0 days) in MX terms at that instant,
  // even though the raw UTC calendar date has already rolled to the 10th.
  const from = new Date('2026-06-10T02:00:00Z');
  assert.equal(
    daysUntilFixedDate('2026-06-09', from),
    0,
    'should be due today in Mexico City terms, not -1 (yesterday) per raw UTC'
  );
});

test('worker still exports the shouldNotifyNow eligibility check', () => {
  const worker = readFileSync('worker/src/notifications.ts', 'utf8');
  assert.ok(worker.includes('shouldNotifyNow'), 'worker/src/notifications.ts missing shouldNotifyNow');
});

test('worker persists a failed send attempt, not just a console log', () => {
  const worker = readFileSync('worker/src/notifications.ts', 'utf8');
  assert.ok(
    worker.includes("recordAttempt(env, sub, 'failed'"),
    'a non-410/404 push failure must be written to notification_attempts, not just logError'
  );
});

test('notification health reports no attempts as an empty state, not a failure', () => {
  const health = resolveNotificationHealth([]);
  assert.equal(health.last_attempt_at, null);
  assert.equal(health.consecutive_failures, 0);
});

test('notification health counts consecutive failures back from the most recent attempt', () => {
  const health = resolveNotificationHealth([
    { status: 'failed', created_at: '2026-06-03' },
    { status: 'expired', created_at: '2026-06-02' },
    { status: 'sent', created_at: '2026-06-01' },
  ]);
  assert.equal(health.consecutive_failures, 2);
  assert.equal(health.last_status, 'failed');
  assert.equal(health.last_attempt_at, '2026-06-03');
});

test('notification health resets the failure streak at the most recent success', () => {
  const health = resolveNotificationHealth([
    { status: 'sent', created_at: '2026-06-03' },
    { status: 'failed', created_at: '2026-06-02' },
    { status: 'failed', created_at: '2026-06-01' },
  ]);
  assert.equal(health.consecutive_failures, 0, 'a recent success should clear the streak');
});
