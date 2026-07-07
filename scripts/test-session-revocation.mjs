// Tests for the "revoke other sessions" logic (mirrors worker/src/auth.ts revokeOtherSessions).
import { test } from 'node:test';
import assert from 'node:assert/strict';

function revokeOtherSessions(sessions, userId, currentToken) {
  const before = sessions.length;
  const kept = sessions.filter((s) => !(s.user_id === userId && s.token !== currentToken));
  const revoked = before - kept.length;
  return { kept, revoked };
}

test('revokes every session for the user except the current one', () => {
  const sessions = [
    { token: 'a', user_id: 'u1' },
    { token: 'b', user_id: 'u1' },
    { token: 'c', user_id: 'u1' },
  ];
  const { kept, revoked } = revokeOtherSessions(sessions, 'u1', 'b');
  assert.equal(revoked, 2);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].token, 'b');
});

test('never touches sessions belonging to other users', () => {
  const sessions = [
    { token: 'a', user_id: 'u1' },
    { token: 'b', user_id: 'u1' },
    { token: 'z', user_id: 'u2' },
  ];
  const { kept, revoked } = revokeOtherSessions(sessions, 'u1', 'a');
  assert.equal(revoked, 1);
  assert.ok(kept.some((s) => s.token === 'z'), 'other user session was wrongly revoked');
});

test('is a no-op when only the current device has a session', () => {
  const sessions = [{ token: 'a', user_id: 'u1' }];
  const { kept, revoked } = revokeOtherSessions(sessions, 'u1', 'a');
  assert.equal(revoked, 0);
  assert.equal(kept.length, 1);
});
