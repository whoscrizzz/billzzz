// Tests for revoking a single session by id (mirrors worker/src/auth.ts revokeSessionByIdHandler:
// `DELETE FROM sessions WHERE id = ? AND user_id = ?`).
import { test } from 'node:test';
import assert from 'node:assert/strict';

function revokeSessionById(sessions, userId, sessionId) {
  const before = sessions.length;
  const kept = sessions.filter((s) => !(s.id === sessionId && s.user_id === userId));
  return { kept, changes: before - kept.length };
}

test('revokes only the targeted session', () => {
  const sessions = [
    { id: '1', user_id: 'u1' },
    { id: '2', user_id: 'u1' },
    { id: '3', user_id: 'u1' },
  ];
  const { kept, changes } = revokeSessionById(sessions, 'u1', '2');
  assert.equal(changes, 1);
  assert.equal(kept.length, 2);
  assert.ok(!kept.some((s) => s.id === '2'));
});

test('is scoped to the requesting user — cannot revoke another user session by id', () => {
  const sessions = [
    { id: '1', user_id: 'u1' },
    { id: '2', user_id: 'u2' },
  ];
  const { kept, changes } = revokeSessionById(sessions, 'u1', '2');
  assert.equal(changes, 0, 'a user must not be able to revoke another user\'s session');
  assert.equal(kept.length, 2);
});

test('is a no-op for a nonexistent session id', () => {
  const sessions = [{ id: '1', user_id: 'u1' }];
  const { kept, changes } = revokeSessionById(sessions, 'u1', 'nonexistent');
  assert.equal(changes, 0);
  assert.equal(kept.length, 1);
});
