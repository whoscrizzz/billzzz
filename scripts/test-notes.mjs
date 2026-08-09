// Tests for worker/src/notes.ts — CRUD scoped by user_id, mismo patrón que
// subscriptions.ts. Imports el módulo real (ver test-helpers/load-ts-module.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { listNotes, createNote, updateNote, deleteNote } = await loadTsModule('worker/src/notes.ts');

/** Fake D1Database en memoria — solo entiende las 4 formas de statement que
 * notes.ts emite (INSERT/UPDATE dinámico/DELETE/SELECT), parseando las
 * columnas del SET a partir del SQL en vez de simular un motor real. */
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
          if (/^INSERT INTO notes/.test(sql)) {
            const [id, user_id, title, body, category, created_at, updated_at] = this._args;
            rows.set(id, { id, user_id, title, body, category, created_at, updated_at });
            return { meta: { changes: 1 } };
          }
          if (/^UPDATE notes SET/.test(sql)) {
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
          if (/^DELETE FROM notes/.test(sql)) {
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

test('createNote rechaza title vacío', async () => {
  const res = await createNote(jsonRequest({ title: '' }), fakeDb(), 'user-1');
  assert.equal(res.status, 400);
});

test('createNote + listNotes: la nota queda scoped al user_id que la creó', async () => {
  const db = fakeDb();
  await createNote(jsonRequest({ title: 'Árboles binarios', body: 'in-order, pre-order' }), db, 'user-1');
  await createNote(jsonRequest({ title: 'Nota de otro usuario' }), db, 'user-2');

  const res = await listNotes(db, 'user-1');
  const { notes } = await res.json();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'Árboles binarios');
});

test('updateNote no puede tocar una nota de otro usuario (404, no 200 silencioso)', async () => {
  const db = fakeDb();
  const createRes = await createNote(jsonRequest({ title: 'Original' }), db, 'user-1');
  const { id } = await createRes.json();

  const res = await updateNote(jsonRequest({ title: 'Hackeada' }), db, 'user-2', id);
  assert.equal(res.status, 404);

  const list = await (await listNotes(db, 'user-1')).json();
  assert.equal(list.notes[0].title, 'Original');
});

test('updateNote con cero campos → 400, no un UPDATE vacío', async () => {
  const db = fakeDb();
  const createRes = await createNote(jsonRequest({ title: 'Original' }), db, 'user-1');
  const { id } = await createRes.json();

  const res = await updateNote(jsonRequest({}), db, 'user-1', id);
  assert.equal(res.status, 400);
});

test('deleteNote: borra solo si pertenece al usuario', async () => {
  const db = fakeDb();
  const createRes = await createNote(jsonRequest({ title: 'Para borrar' }), db, 'user-1');
  const { id } = await createRes.json();

  const otherUserAttempt = await deleteNote(db, 'user-2', id);
  assert.equal(otherUserAttempt.status, 404);

  const ownerAttempt = await deleteNote(db, 'user-1', id);
  assert.equal(ownerAttempt.status, 200);

  const list = await (await listNotes(db, 'user-1')).json();
  assert.equal(list.notes.length, 0);
});
