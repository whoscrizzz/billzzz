// Regresión: dos llamadas concurrentes a syncNotePendingOps() deben compartir
// una sola corrida. Al reconectar hay dos disparadores casi simultáneos (el
// handler del evento `online` y el useEffect que reacciona a setOnline(true)),
// y sin el guard de "in flight" ambos leen la cola antes de que ninguno haya
// hecho clearNotePendingOp — subiendo un `create` offline DOS veces.
// Reproducido en local antes del fix: dos filas idénticas en D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

/** El módulo importa ./api y ./offline-db, que tocan fetch/IndexedDB. Se
 *  sustituyen por dobles en memoria para poder ejercitar solo la concurrencia. */
const created = [];
let queue = [{ id: 1, type: 'create', noteId: 'temp-1', payload: { title: 'Offline' } }];

const { syncNotePendingOps } = await loadTsModule('src/lib/notes-sync.ts', {
  stubs: {
    './api': {
      createNote: async (payload) => {
        // Latencia real: sin ella las dos corridas se serializarían por azar.
        await new Promise((r) => setTimeout(r, 20));
        created.push(payload.title);
        return { id: `server-${created.length}` };
      },
      updateNote: async () => {},
      deleteNote: async () => {},
      fetchNotes: async () => ({ notes: [] }),
    },
    './offline-db': {
      getNotePendingOps: async () => queue,
      clearNotePendingOp: async (id) => {
        queue = queue.filter((op) => op.id !== id);
      },
      putLocalNote: async () => {},
      removeLocalNote: async () => {},
      replaceLocalNotes: async () => {},
      remapNotePendingOpId: async () => {},
    },
  },
});

test('dos syncs concurrentes suben el create una sola vez', async () => {
  await Promise.all([syncNotePendingOps(), syncNotePendingOps()]);
  assert.deepEqual(created, ['Offline'], 'el create encolado se subió más de una vez');
});
