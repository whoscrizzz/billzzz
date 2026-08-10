import { useCallback, useEffect, useState } from 'react';
import {
  createReminder as apiCreate,
  deleteReminder as apiDelete,
  fetchReminders,
  updateReminder as apiUpdate,
} from '../lib/api';
import type { Reminder, ReminderInput } from '../types/notes';

/** CRUD online-required, sin cola offline — a diferencia de useNotes, el
 * valor de un recordatorio ahora es el push desde servidor (worker/src/
 * reminder-notifications.ts), que de todos modos necesita conexión para
 * programarse. Decisión explícita del usuario, ver plan de la feature. */
export function useReminders(enabled: boolean) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const { reminders: remote } = await fetchReminders();
      setReminders(remote);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async (input: ReminderInput) => {
    try {
      await apiCreate(input);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el recordatorio');
    }
  };

  const update = async (
    id: string,
    input: Partial<{ title: string; due_at: string; done: boolean }>
  ) => {
    setReminders((prev) =>
      prev.map((r): Reminder => {
        if (r.id !== id) return r;
        return {
          ...r,
          title: input.title ?? r.title,
          due_at: input.due_at ?? r.due_at,
          done: input.done == null ? r.done : input.done ? 1 : 0,
        };
      })
    );
    try {
      await apiUpdate(id, input);
      await refresh();
    } catch (err) {
      // refresh() reconcilia el estado optimista con el servidor antes de
      // mostrar el error — si no, su propio setError(null) inicial pisaría
      // el mensaje que ponemos acá.
      await refresh();
      setError(err instanceof Error ? err.message : 'Error al actualizar el recordatorio');
    }
  };

  const remove = async (id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    try {
      await apiDelete(id);
    } catch (err) {
      await refresh();
      setError(err instanceof Error ? err.message : 'Error al eliminar el recordatorio');
    }
  };

  return { reminders, loading, error, refresh, add, update, remove };
}
