// Tests for worker/src/notes.ts — CRUD scoped by user_id, mismo patrón que
// subscriptions.ts. Imports el módulo real (ver test-helpers/load-ts-module.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const {
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  listTrashedNotes,
  restoreTrashedNote,
} = await loadTsModule('worker/src/notes.ts');

/** Fake D1Database en memoria — solo entiende las formas de statement que
 * notes.ts emite (INSERT/UPDATE dinámico/SELECT), parseando las columnas del
 * SET y las condiciones trashed_at del WHERE a partir del SQL en vez de
 * simular un motor real. deleteNote/restoreTrashedNote son UPDATE, no hay
 * DELETE físico desde migración 0019. */
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
          if (/^INSERT INTO notes/.test(sql)) {
            const [id, user_id, title, body, category, created_at, updated_at] = this._args;
            if (rows.has(id)) {
              throw new Error('UNIQUE constraint failed: notes.id');
            }
            rows.set(id, {
              id,
              user_id,
              title,
              body,
              category,
              trashed_at: null,
              created_at,
              updated_at,
            });
            return { meta: { changes: 1 } };
          }
          if (/^UPDATE notes SET/.test(sql)) {
            const setPart = sql.slice(sql.indexOf('SET') + 3, sql.indexOf('WHERE'));
            const wherePart = sql.slice(sql.indexOf('WHERE'));
            const assignments = setPart.split(',').map((s) => s.trim());
            const id = this._args[this._args.length - 2];
            const userId = this._args[this._args.length - 1];
            const row = rows.get(id);
            if (!row || row.user_id !== userId) return { meta: { changes: 0 } };
            if (/trashed_at IS NOT NULL/.test(wherePart) && row.trashed_at === null) {
              return { meta: { changes: 0 } };
            }
            if (/trashed_at IS NULL/.test(wherePart) && row.trashed_at !== null) {
              return { meta: { changes: 0 } };
            }
            let argIndex = 0;
            for (const assignment of assignments) {
              // trashed_at = NULL es literal en el SQL, no un bind — no
              // consume un arg (a diferencia de `col = ?`).
              const literalNull = assignment.match(/^(\w+)\s*=\s*NULL$/);
              if (literalNull) {
                row[literalNull[1]] = null;
                continue;
              }
              const simple = assignment.match(/^(\w+)\s*=\s*\?$/);
              if (simple) {
                row[simple[1]] = this._args[argIndex++];
                continue;
              }
              throw new Error('fakeDb: unhandled SET assignment: ' + assignment);
            }
            return { meta: { changes: 1 } };
          }
          throw new Error('unhandled SQL in fakeDb: ' + sql);
        },
        async all() {
          const [userId] = this._args;
          let results = [...rows.values()].filter((r) => r.user_id === userId);
          if (/trashed_at IS NOT NULL/.test(sql)) {
            results = results.filter((r) => r.trashed_at !== null);
          } else if (/trashed_at IS NULL/.test(sql)) {
            results = results.filter((r) => r.trashed_at === null);
          }
          return { results };
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

test('createNote rechaza title vacío', async () => {
  const res = await createNote(jsonRequest({ title: '' }), fakeDb(), 'user-1');
  assert.equal(res.status, 400);
});

test('createNote usa el id del cliente si es un UUID válido', async () => {
  const db = fakeDb();
  const clientId = crypto.randomUUID();
  const res = await createNote(jsonRequest({ title: 'X', id: clientId }), db, 'user-1');
  const { id } = await res.json();
  assert.equal(res.status, 201);
  assert.equal(id, clientId);
});

test('reenviar el mismo createNote (mismo id) no duplica la fila — 200 idempotente', async () => {
  const db = fakeDb();
  const clientId = crypto.randomUUID();
  const req = () => jsonRequest({ title: 'X', id: clientId });

  assert.equal((await createNote(req(), db, 'user-1')).status, 201);

  const second = await createNote(req(), db, 'user-1');
  assert.equal(second.status, 200, 'un retry del mismo create debe ser idempotente, no un error');
  const { id } = await second.json();
  assert.equal(id, clientId);

  const list = await (await listNotes(db, 'user-1')).json();
  assert.equal(list.notes.length, 1, 'no debe haber quedado una fila duplicada');
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

test('deleteNote: solo si pertenece al usuario, y es soft-delete (trashed_at, no borra la fila)', async () => {
  const db = fakeDb();
  const createRes = await createNote(jsonRequest({ title: 'Para borrar' }), db, 'user-1');
  const { id } = await createRes.json();

  const otherUserAttempt = await deleteNote(db, 'user-2', id);
  assert.equal(otherUserAttempt.status, 404);

  const ownerAttempt = await deleteNote(db, 'user-1', id);
  assert.equal(ownerAttempt.status, 200);

  const list = await (await listNotes(db, 'user-1')).json();
  assert.equal(list.notes.length, 0, 'listNotes no debe devolver notas trashed');
  assert.ok(db._rows.get(id), 'la fila sigue existiendo, no se borró físicamente');
  assert.ok(db._rows.get(id).trashed_at, 'trashed_at quedó seteado');
});

test('borrar dos veces la misma nota da 404 la segunda vez', async () => {
  const db = fakeDb();
  const { id } = await (await createNote(jsonRequest({ title: 'X' }), db, 'user-1')).json();

  assert.equal((await deleteNote(db, 'user-1', id)).status, 200);
  assert.equal((await deleteNote(db, 'user-1', id)).status, 404);
});

test('updateNote sobre una nota en la papelera devuelve 404 (no se puede editar trashed)', async () => {
  const db = fakeDb();
  const { id } = await (await createNote(jsonRequest({ title: 'X' }), db, 'user-1')).json();
  await deleteNote(db, 'user-1', id);

  const res = await updateNote(jsonRequest({ title: 'Editada' }), db, 'user-1', id);
  assert.equal(res.status, 404);
});

test('listTrashedNotes / restoreTrashedNote', async () => {
  const db = fakeDb();
  const { id } = await (await createNote(jsonRequest({ title: 'X' }), db, 'user-1')).json();
  await deleteNote(db, 'user-1', id);

  const trashedForOther = await (await listTrashedNotes(db, 'user-2')).json();
  assert.equal(trashedForOther.notes.length, 0, 'la papelera está scoped por usuario');

  const trashed = await (await listTrashedNotes(db, 'user-1')).json();
  assert.equal(trashed.notes.length, 1);
  assert.equal(trashed.notes[0].id, id);

  assert.equal((await restoreTrashedNote(db, 'user-2', id)).status, 404, 'otro usuario no puede restaurar');

  const restoreRes = await restoreTrashedNote(db, 'user-1', id);
  assert.equal(restoreRes.status, 200);

  const list = await (await listNotes(db, 'user-1')).json();
  assert.equal(list.notes.length, 1, 'vuelve a aparecer en la lista normal');
  assert.equal(db._rows.get(id).trashed_at, null);
});
