// Tests for revoking a single session by id (worker/src/auth.ts).
// Imports the real module (see test-helpers/load-ts-module.mjs): antes este
// archivo reimplementaba el filtro en línea, así que perder el `AND user_id = ?`
// del DELETE —un usuario cerrando la sesión de otro— no habría roto nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';
import { fakeSessionsDb } from './test-helpers/fake-sessions-db.mjs';

const { revokeSessionByIdHandler } = await loadTsModule('worker/src/auth.ts');

test('revokes only the targeted session', async () => {
  const db = fakeSessionsDb([
    { id: '1', token: 'a', user_id: 'u1' },
    { id: '2', token: 'b', user_id: 'u1' },
    { id: '3', token: 'c', user_id: 'u1' },
  ]);

  const res = await revokeSessionByIdHandler({ DB: db }, 'u1', '2');

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.deepEqual(
    db.sessions.map((s) => s.id),
    ['1', '3']
  );
});

test('is scoped to the requesting user — cannot revoke another user session by id', async () => {
  const db = fakeSessionsDb([
    { id: '1', token: 'a', user_id: 'u1' },
    { id: '2', token: 'b', user_id: 'u2' },
  ]);

  const res = await revokeSessionByIdHandler({ DB: db }, 'u1', '2');

  assert.equal(res.status, 404, 'una sesión ajena se ve igual que una inexistente');
  assert.equal(db.sessions.length, 2, 'no se puede revocar la sesión de otro usuario');
});

test('is a no-op for a nonexistent session id', async () => {
  const db = fakeSessionsDb([{ id: '1', token: 'a', user_id: 'u1' }]);

  const res = await revokeSessionByIdHandler({ DB: db }, 'u1', 'nonexistent');

  assert.equal(res.status, 404);
  assert.equal(db.sessions.length, 1);
});
