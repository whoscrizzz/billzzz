// Tests for worker/src/reminders.ts — CRUD scoped by user_id + la regla de
// que reprogramar due_at limpia notified_at (vuelve a ser elegible para el
// cron de push, ver worker/src/reminder-notifications.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { listReminders, createReminder, updateReminder, deleteReminder } = await loadTsModule(
  'worker/src/reminders.ts'
);

/** Fake D1Database en memoria, mismo enfoque que test-notes.mjs. */
function fakeDb() {
  const rows = new Map();
  return {
    _rows: rows,
    prepare(sql) {
      return {
        _args: [],
        bind(...args) {
          this._args = args;
          return this;
        },
        async run() {
          if (/^INSERT INTO reminders/.test(sql)) {
            const [id, user_id, title, due_at, , created_at, updated_at] = this._args;
            rows.set(id, {
              id,
              user_id,
              title,
              due_at,
              done: 0,
              notified_at: null,
              created_at,
              updated_at,
            });
            return { meta: { changes: 1 } };
          }
          if (/^UPDATE reminders SET/.test(sql)) {
            const setPart = sql.slice(sql.indexOf('SET') + 3, sql.indexOf('WHERE'));
            const cols = [...setPart.matchAll(/(\w+)\s*=\s*\?/g)].map((m) => m[1]);
            const id = this._args[this._args.length - 2];
            const userId = this._args[this._args.length - 1];
            const row = rows.get(id);
            if (!row || row.user_id !== userId) return { meta: { changes: 0 } };
            cols.forEach((col, i) => {
              row[col] = this._args[i];
            });
            return { meta: { changes: 1 } };
          }
          if (/^DELETE FROM reminders/.test(sql)) {
            const [id, userId] = this._args;
            const row = rows.get(id);
            if (!row || row.user_id !== userId) return { meta: { changes: 0 } };
            rows.delete(id);
            return { meta: { changes: 1 } };
          }
          throw new Error('unhandled SQL in fakeDb: ' + sql);
        },
        async all() {
          const [userId] = this._args;
          return { results: [...rows.values()].filter((r) => r.user_id === userId) };
        },
      };
    },
  };
}

function jsonRequest(body) {
  return new Request('http://x/', { method: 'POST', body: JSON.stringify(body) });
}

test('createReminder exige due_at válido', async () => {
  const res = await createReminder(jsonRequest({ title: 'Entregar ensayo', due_at: 'no-es-fecha' }), fakeDb(), 'user-1');
  assert.equal(res.status, 400);
});

test('createReminder: nace con done=0 y notified_at=null', async () => {
  const db = fakeDb();
  await createReminder(
    jsonRequest({ title: 'Reunión de equipo', due_at: '2026-08-10T10:00:00.000Z' }),
    db,
    'user-1'
  );
  const { reminders } = await (await listReminders(db, 'user-1')).json();
  assert.equal(reminders[0].done, 0);
  assert.equal(reminders[0].notified_at, null);
});

test('marcar done=true no toca due_at ni notified_at', async () => {
  const db = fakeDb();
  const { id } = await (
    await createReminder(jsonRequest({ title: 'X', due_at: '2026-08-10T10:00:00.000Z' }), db, 'user-1')
  ).json();

  await updateReminder(jsonRequest({ done: true }), db, 'user-1', id);

  const { reminders } = await (await listReminders(db, 'user-1')).json();
  assert.equal(reminders[0].done, 1);
  assert.equal(reminders[0].due_at, '2026-08-10T10:00:00.000Z');
});

test('reprogramar due_at limpia notified_at para que el cron vuelva a notificar', async () => {
  const db = fakeDb();
  const { id } = await (
    await createReminder(jsonRequest({ title: 'X', due_at: '2026-08-10T10:00:00.000Z' }), db, 'user-1')
  ).json();

  // Simula que el cron ya lo marcó como notificado (solo el cron puede
  // escribir notified_at — no hay endpoint público para eso, así que la
  // prueba lo pone directo en el store del fake).
  db._rows.get(id).notified_at = '2026-08-09T09:00:00.000Z';

  await updateReminder(jsonRequest({ title: 'no debería tocar notified_at' }), db, 'user-1', id);
  assert.equal(db._rows.get(id).notified_at, '2026-08-09T09:00:00.000Z', 'un update sin due_at no lo limpia');

  await updateReminder(jsonRequest({ due_at: '2026-08-15T10:00:00.000Z' }), db, 'user-1', id);

  const { reminders } = await (await listReminders(db, 'user-1')).json();
  assert.equal(reminders[0].due_at, '2026-08-15T10:00:00.000Z');
  assert.equal(reminders[0].notified_at, null);
});

test('updateReminder / deleteReminder están scoped por user_id (404 para otro usuario)', async () => {
  const db = fakeDb();
  const { id } = await (
    await createReminder(jsonRequest({ title: 'X', due_at: '2026-08-10T10:00:00.000Z' }), db, 'user-1')
  ).json();

  assert.equal((await updateReminder(jsonRequest({ done: true }), db, 'user-2', id)).status, 404);
  assert.equal((await deleteReminder(db, 'user-2', id)).status, 404);
  assert.equal((await deleteReminder(db, 'user-1', id)).status, 200);
});
