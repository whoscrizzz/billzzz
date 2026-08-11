// Tests for "revoke other sessions" (worker/src/auth.ts).
// Imports the real module (see test-helpers/load-ts-module.mjs): antes este
// archivo reimplementaba el filtro en línea, así que una regresión en el SQL
// —perder el scoping por usuario, por ejemplo— lo dejaba igual de verde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';
import { fakeSessionsDb } from './test-helpers/fake-sessions-db.mjs';

const { revokeOtherSessions, revokeOtherSessionsHandler } = await loadTsModule(
  'worker/src/auth.ts'
);

test('revokes every session for the user except the current one', async () => {
  const db = fakeSessionsDb([
    { id: '1', token: 'a', user_id: 'u1' },
    { id: '2', token: 'b', user_id: 'u1' },
    { id: '3', token: 'c', user_id: 'u1' },
  ]);

  const revoked = await revokeOtherSessions({ DB: db }, 'u1', 'b');

  assert.equal(revoked, 2);
  assert.deepEqual(
    db.sessions.map((s) => s.token),
    ['b']
  );
});

test('never touches sessions belonging to other users', async () => {
  const db = fakeSessionsDb([
    { id: '1', token: 'a', user_id: 'u1' },
    { id: '2', token: 'b', user_id: 'u1' },
    { id: '3', token: 'z', user_id: 'u2' },
  ]);

  const revoked = await revokeOtherSessions({ DB: db }, 'u1', 'a');

  assert.equal(revoked, 1);
  assert.ok(
    db.sessions.some((s) => s.token === 'z'),
    'other user session was wrongly revoked'
  );
});

test('is a no-op when only the current device has a session', async () => {
  const db = fakeSessionsDb([{ id: '1', token: 'a', user_id: 'u1' }]);

  const revoked = await revokeOtherSessions({ DB: db }, 'u1', 'a');

  assert.equal(revoked, 0);
  assert.equal(db.sessions.length, 1);
});

test('invalida también los tokens de acción de las notificaciones ya entregadas', async () => {
  // Sin este bump, los botones de un push viejo seguirían escribiendo durante
  // 14 días después de "cerrar las otras sesiones".
  const db = fakeSessionsDb([
    { id: '1', token: 'a', user_id: 'u1' },
    { id: '2', token: 'b', user_id: 'u1' },
  ]);

  await revokeOtherSessions({ DB: db }, 'u1', 'a');

  assert.equal(db.actionTokenVersion, 1);
});

test('el handler exige un bearer token y responde 401 sin él', async () => {
  const db = fakeSessionsDb([{ id: '1', token: 'a', user_id: 'u1' }]);

  const res = await revokeOtherSessionsHandler(new Request('https://x.example/'), { DB: db }, 'u1');

  assert.equal(res.status, 401);
  assert.equal(db.executed.length, 0, 'no debe tocar la base sin sesión');
});

test('el handler revoca usando el token del header y devuelve la cuenta', async () => {
  const db = fakeSessionsDb([
    { id: '1', token: 'a', user_id: 'u1' },
    { id: '2', token: 'b', user_id: 'u1' },
  ]);

  const res = await revokeOtherSessionsHandler(
    new Request('https://x.example/', { headers: { Authorization: 'Bearer a' } }),
    { DB: db },
    'u1'
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, revoked: 1 });
  assert.deepEqual(
    db.sessions.map((s) => s.token),
    ['a'],
    'conserva la sesión del propio header'
  );
});
