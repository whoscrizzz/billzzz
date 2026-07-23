// Tests for the notification-dedup claim mechanism (isUniqueConstraintError
// in worker/src/env.ts). notifications.ts and email-digest.ts both claim a
// notification_log row via INSERT before sending, relying on this function
// to tell "already claimed by another cron tick" apart from a real failure.
// Imports the real module (see test-helpers/load-ts-module.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { isUniqueConstraintError } = await loadTsModule('worker/src/env.ts');

test('recognizes the exact D1 error message for a UNIQUE constraint violation', () => {
  // Captured verbatim from a real local D1 duplicate insert against
  // notification_log during this session's manual verification.
  const err = new Error(
    'D1_ERROR: UNIQUE constraint failed: notification_log.user_id, notification_log.subscription_id, notification_log.notification_key: SQLITE_CONSTRAINT'
  );
  assert.ok(isUniqueConstraintError(err));
});

test('does not mistake an unrelated D1 error for a dedup collision', () => {
  const err = new Error('D1_ERROR: no such table: notification_log: SQLITE_ERROR');
  assert.ok(!isUniqueConstraintError(err));
});

test('does not throw on non-Error values', () => {
  assert.ok(!isUniqueConstraintError('some string'));
  assert.ok(!isUniqueConstraintError(null));
  assert.ok(!isUniqueConstraintError(undefined));
});
