import { createNote, deleteNote, fetchNotes, updateNote } from './api';
import type { NoteInput } from '../types/notes';
import {
  clearNotePendingOp,
  getNotePendingOps,
  putLocalNote,
  remapNotePendingOpId,
  removeLocalNote,
  replaceLocalNotes,
} from './offline-db';

/** Corrida en vuelo compartida entre llamadores concurrentes.
 *
 * Al reconectar hay DOS disparadores casi simultáneos: el handler del evento
 * `online` en useNotes llama a esta función directamente, y su `setOnline(true)`
 * cambia la identidad de `refresh` (depende de `online`), lo que dispara el
 * useEffect que llama a `refresh()` — que vuelve a llamar acá. Sin este guard
 * las dos corridas leen la misma cola antes de que ninguna haya hecho
 * `clearNotePendingOp`, y un `create` encolado offline se sube DOS veces
 * (verificado en local: dos filas idénticas en D1). */
let inFlight: Promise<number> | null = null;

/** Mismo flow que syncPendingOps (sync.ts) para subscriptions, aplicado a la
 * cola separada de notas — ver la nota en offline-db.ts sobre por qué no
 * comparten una sola cola. */
export async function syncNotePendingOps(): Promise<number> {
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<number> {
  const ops = await getNotePendingOps();
  let synced = 0;
  const idRemap = new Map<string, string>();

  for (const op of ops) {
    if (op.id == null) continue;
    const noteId = idRemap.get(op.noteId) ?? op.noteId;

    try {
      switch (op.type) {
        case 'create': {
          const payload = op.payload as NoteInput;
          const { id } = await createNote(payload);
          idRemap.set(op.noteId, id);
          await remapNotePendingOpId(op.noteId, id);
          await removeLocalNote(op.noteId);
          await putLocalNote({
            id,
            user_id: '',
            title: payload.title,
            body: payload.body ?? '',
            category: payload.category ?? null,
            trashed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          break;
        }
        case 'update': {
          await updateNote(noteId, op.payload as Partial<NoteInput>);
          break;
        }
        case 'delete': {
          await deleteNote(noteId);
          break;
        }
        default: {
          const _exhaustive: never = op.type;
          return _exhaustive;
        }
      }
      await clearNotePendingOp(op.id);
      synced++;
    } catch (err) {
      const status = (err as { status?: number })?.status ?? 0;
      if (status >= 400 && status < 500) {
        await clearNotePendingOp(op.id);
        continue;
      }
      break;
    }
  }

  if (synced > 0) {
    const { notes } = await fetchNotes();
    await replaceLocalNotes(notes);
  }

  return synced;
}
