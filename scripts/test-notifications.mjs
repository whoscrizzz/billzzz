// Tests for notification eligibility logic. Imports the real worker/src
// modules (bundled with esbuild — see test-helpers/load-ts-module.mjs) so a
// regression in the shipped code actually fails these tests, instead of a
// hand-copied reimplementation that can silently drift from what ships.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { daysUntilNextDue } = await loadTsModule('worker/src/due-dates.ts');
const { shouldNotifyNow } = await loadTsModule('worker/src/notifications.ts');
const { resolveNotificationHealth } = await loadTsModule('worker/src/notification-health.ts');

function baseSub(overrides = {}) {
  return {
    id: 's1',
    user_id: 'u1',
    name: 'Test',
    amount: 100,
    currency: 'MXN',
    due_day: 1,
    due_date: null,
    due_dates: null,
    frequency: 'monthly',
    category: null,
    notes: null,
    notify_days_before: 3,
    notify_hour: 9,
    snoozed_until: null,
    created_at: '2020-01-01T00:00:00.000Z',
    updated_at: '2020-01-01T00:00:00.000Z',
    deleted_at: null,
    last_paid_at: null,
    ...overrides,
  };
}

test('computes days until the next monthly occurrence in UTC', () => {
  const from = new Date('2026-06-01T15:00:00Z');
  const sub = baseSub({ due_day: 5 });
  assert.equal(daysUntilNextDue(sub, from), 4);
});

test('day math for an evening notify_hour agrees with Mexico City, not raw UTC', () => {
  // 2026-06-10T02:00:00Z is 2026-06-09 20:00 in Mexico City (fixed UTC-6, no DST).
  // A bill due 2026-06-09 is due "today" (0 days) in MX terms at that instant,
  // even though the raw UTC calendar date has already rolled to the 10th.
  const from = new Date('2026-06-10T02:00:00Z');
  const sub = baseSub({ frequency: 'once', due_date: '2026-06-09', due_day: 9 });
  assert.equal(
    daysUntilNextDue(sub, from),
    0,
    'should be due today in Mexico City terms, not -1 (yesterday) per raw UTC'
  );
});

test('daysUntilNextDue honors an explicit timezone instead of always defaulting to Mexico City', () => {
  // 2026-07-23T23:30:00Z: still 2026-07-23 in Mexico City/Los Angeles, but
  // already 2026-07-24 in Madrid (CEST, UTC+2) — the calendar day differs.
  const from = new Date('2026-07-23T23:30:00Z');
  const sub = baseSub({ frequency: 'once', due_date: '2026-08-01', due_day: 1 });
  const mx = daysUntilNextDue(sub, from, 'America/Mexico_City');
  const madrid = daysUntilNextDue(sub, from, 'Europe/Madrid');
  assert.equal(daysUntilNextDue(sub, from), mx, 'no-timezone-arg call must match explicit MX');
  assert.equal(madrid, mx - 1, "Madrid's calendar day is already one day ahead at this instant");
});

test("shouldNotifyNow uses the owning user's timezone, not a hardcoded one", () => {
  // At this instant it's 14:00 in Mexico City but 22:00 in Madrid; due_date
  // is "today" in both zones so only the hour-of-day should decide.
  const now = new Date('2026-06-10T20:00:00Z');
  const sub = baseSub({
    frequency: 'once',
    due_date: '2026-06-10',
    due_day: 10,
    notify_hour: 22,
  });
  assert.ok(
    shouldNotifyNow(sub, now, 'Europe/Madrid'),
    'a Madrid user with notify_hour 22 should be notified at this instant'
  );
  assert.ok(
    !shouldNotifyNow(sub, now, 'America/Mexico_City'),
    'a Mexico City user with notify_hour 22 should NOT be notified at this instant (it is 14:00 there)'
  );
});

test('notifies for recently overdue bills but not stale ones', () => {
  const now = new Date('2026-06-10T15:00:00Z'); // 09:00 in Mexico City
  const overdueRecently = baseSub({
    frequency: 'once',
    due_date: '2026-06-08',
    due_day: 8,
    notify_hour: 9,
    notify_days_before: 3,
  });
  const overdueStale = baseSub({
    frequency: 'once',
    due_date: '2026-05-01',
    due_day: 1,
    notify_hour: 9,
    notify_days_before: 3,
  });
  assert.ok(shouldNotifyNow(overdueRecently, now), 'should notify overdue within 7 days');
  assert.ok(!shouldNotifyNow(overdueStale, now), 'should not notify very old overdue');
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

// sendDueNotifications itself needs a live D1 + push endpoint to exercise
// end-to-end (see docs/DEPLOY.md for how that was verified manually this
// session); these two are source-grep regression guards for behavior that
// isn't covered by the pure-function tests above.
test("worker joins users to resolve each subscription's notify timezone", () => {
  const worker = readFileSync('worker/src/notifications.ts', 'utf8');
  assert.ok(
    worker.includes('u.timezone AS user_timezone'),
    "sendDueNotifications must read the owning user's timezone, not assume NOTIFY_TIMEZONE for everyone"
  );
});

test('worker persists a failed send attempt, not just a console log', () => {
  const worker = readFileSync('worker/src/notifications.ts', 'utf8');
  assert.ok(
    worker.includes("recordAttempt(env, sub, 'failed'"),
    'a non-410/404 push failure must be written to notification_attempts, not just logError'
  );
});
