import { useCallback, useEffect, useState } from 'react';
import {
  createNote as apiCreate,
  deleteNote as apiDelete,
  fetchNotes,
  updateNote as apiUpdate,
} from '../lib/api';
import { getSessionToken } from '../lib/auth';
import {
  getLocalNotes,
  getNotePendingOps,
  isOnline,
  putLocalNote,
  queueNotePendingOp,
  removeLocalNote,
  replaceLocalNotes,
  mergeRemoteNotes,
} from '../lib/offline-db';
import { syncNotePendingOps } from '../lib/notes-sync';
import type { Note, NoteInput } from '../types/notes';

/** Mismo patrón optimista que useSubscriptions.ts, aplicado a notas —
 * offline-first completo (IndexedDB + cola de sync), decisión explícita del
 * usuario para preservar el "funciona sin conexión" del Notes+ original. */
export function useNotes(enabled: boolean) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(isOnline());
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!enabled) return;
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        if (online && getSessionToken()) {
          await syncNotePendingOps();
          const { notes: remote } = await fetchNotes();
          const pending = await getNotePendingOps();
          if (pending.length === 0) {
            await replaceLocalNotes(remote);
          } else {
            await mergeRemoteNotes(remote);
          }
          setNotes(remote);
        } else {
          setNotes(await getLocalNotes());
        }
      } catch (err) {
        const local = await getLocalNotes();
        setNotes(local);
        setError(local.length === 0 ? (err instanceof Error ? err.message : 'Error') : null);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [enabled, online]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      if (enabled && getSessionToken()) {
        void syncNotePendingOps().then(() => refresh());
      }
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(async () => {
      const ops = await getNotePendingOps();
      setPendingCount(ops.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [enabled]);

  const add = async (input: NoteInput) => {
    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
    const optimistic: Note = {
      id: tempId,
      user_id: '',
      title: input.title,
      body: input.body ?? '',
      category: input.category ?? null,
      created_at: now,
      updated_at: now,
    };

    await putLocalNote(optimistic);
    setNotes((prev) => [optimistic, ...prev]);

    if (online && getSessionToken()) {
      try {
        const { id } = await apiCreate(input);
        await removeLocalNote(tempId);
        await putLocalNote({ ...optimistic, id });
        await refresh();
      } catch (err) {
        const status = (err as { status?: number })?.status ?? 0;
        if (status >= 400 && status < 500) {
          await removeLocalNote(tempId);
          setNotes((prev) => prev.filter((n) => n.id !== tempId));
          throw err;
        }
        await queueNotePendingOp({ type: 'create', noteId: tempId, payload: input });
        setPendingCount((c) => c + 1);
      }
    } else {
      await queueNotePendingOp({ type: 'create', noteId: tempId, payload: input });
      setPendingCount((c) => c + 1);
    }
  };

  const remove = async (id: string) => {
    await removeLocalNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));

    if (online && getSessionToken()) {
      try {
        await apiDelete(id);
      } catch {
        await queueNotePendingOp({ type: 'delete', noteId: id });
        setPendingCount((c) => c + 1);
      }
    } else {
      await queueNotePendingOp({ type: 'delete', noteId: id });
      setPendingCount((c) => c + 1);
    }
  };

  const update = async (id: string, input: Partial<NoteInput>) => {
    const now = new Date().toISOString();
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...input, updated_at: now } : n)));
    const current = (await getLocalNotes()).find((n) => n.id === id);
    if (current) await putLocalNote({ ...current, ...input, updated_at: now });

    if (online && getSessionToken()) {
      try {
        await apiUpdate(id, input);
      } catch {
        await queueNotePendingOp({ type: 'update', noteId: id, payload: input });
        setPendingCount((c) => c + 1);
      }
    } else {
      await queueNotePendingOp({ type: 'update', noteId: id, payload: input });
      setPendingCount((c) => c + 1);
    }
  };

  return { notes, loading, online, error, pendingCount, refresh, add, update, remove };
}
