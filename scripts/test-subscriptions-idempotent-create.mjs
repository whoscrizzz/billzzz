// Regresión del finding #5 del review de Notes+: createSubscription ahora
// acepta un id generado por el cliente y lo usa como PRIMARY KEY, para que
// un create reintentado (retry de red, reconexión con doble disparo — ver
// sync.ts) no duplique la fila. fakeDb simula la constraint real de D1
// (INSERT con id repetido -> Error 'UNIQUE constraint failed').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { createSubscription } = await loadTsModule('worker/src/subscriptions.ts');

function fakeDb() {
  const rows = new Map();
  return {
    prepare(sql) {
      return {
        _args: [],
        bind(...args) {
          this._args = args;
          return this;
        },
        async run() {
          if (/^INSERT INTO subscriptions/.test(sql)) {
            const [id, user_id] = this._args;
            if (rows.has(id)) {
              throw new Error(`UNIQUE constraint failed: subscriptions.id`);
            }
            rows.set(id, { id, user_id });
            return { meta: { changes: 1 } };
          }
          throw new Error('unhandled SQL in fakeDb: ' + sql);
        },
        async first() {
          const [id, userId] = this._args;
          const row = rows.get(id);
          return row && row.user_id === userId ? row : null;
        },
      };
    },
  };
}

function jsonRequest(body) {
  return new Request('http://x/', { method: 'POST', body: JSON.stringify(body) });
}

const validPayload = { name: 'Netflix', amount: 219, frequency: 'monthly', due_day: 15 };

test('createSubscription usa el id del cliente si es un UUID válido', async () => {
  const db = fakeDb();
  const clientId = crypto.randomUUID();
  const res = await createSubscription(
    jsonRequest({ ...validPayload, id: clientId }),
    db,
    'user-1'
  );
  const { id } = await res.json();
  assert.equal(res.status, 201);
  assert.equal(id, clientId);
});

test('createSubscription ignora un id inválido y genera uno propio', async () => {
  const db = fakeDb();
  const res = await createSubscription(
    jsonRequest({ ...validPayload, id: 'no-es-un-uuid' }),
    db,
    'user-1'
  );
  const { id } = await res.json();
  assert.equal(res.status, 201);
  assert.notEqual(id, 'no-es-un-uuid');
});

test('reenviar el mismo create (mismo id) no duplica la fila — responde 200 idempotente', async () => {
  const db = fakeDb();
  const clientId = crypto.randomUUID();
  const req = () => jsonRequest({ ...validPayload, id: clientId });

  const first = await createSubscription(req(), db, 'user-1');
  assert.equal(first.status, 201);

  const second = await createSubscription(req(), db, 'user-1');
  assert.equal(second.status, 200, 'un retry del mismo create debe ser idempotente, no un error');
  const { id } = await second.json();
  assert.equal(id, clientId);
});

test('un id colisionando con la fila de OTRO usuario no se cuela como éxito', async () => {
  const db = fakeDb();
  const clientId = crypto.randomUUID();

  await createSubscription(jsonRequest({ ...validPayload, id: clientId }), db, 'user-1');

  await assert.rejects(
    () => createSubscription(jsonRequest({ ...validPayload, id: clientId }), db, 'user-2'),
    /UNIQUE constraint failed/,
    'una colisión de id entre usuarios distintos no debe responder éxito silencioso'
  );
});
