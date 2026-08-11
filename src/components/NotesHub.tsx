import { useState } from 'react';
import { ActionIcon } from './ActionIcon';
import { NotesList } from './NotesList';
import { RemindersView } from './RemindersView';
import { NotesTrashPanel } from './NotesTrashPanel';
import { useNotes } from '../hooks/useNotes';
import { useReminders } from '../hooks/useReminders';
import {
  fetchTrashedNotes,
  fetchTrashedReminders,
  restoreTrashedNote,
  restoreTrashedReminder,
} from '../lib/api';
import type { Note, Reminder } from '../types/notes';

type NotesView = 'notes' | 'reminders';

/** Contenedor con pill-nav de 2 vistas (mismo selector flotante de iconos
 * que usaba la feature Finanzas, removida — las clases `.finanzas-*` de
 * App.css quedaron como el pill-hub genérico, ver ese comentario). Vive
 * como pestaña nueva ('notes') en el nav existente — port de Notes+ (app
 * standalone separada). */
export function NotesHub() {
  const [view, setView] = useState<NotesView>('notes');
  const notesState = useNotes(true);
  const remindersState = useReminders(true);

  const [showTrash, setShowTrash] = useState(false);
  const [trashedNotes, setTrashedNotes] = useState<Note[]>([]);
  const [trashedReminders, setTrashedReminders] = useState<Reminder[]>([]);

  const openTrash = async () => {
    setShowTrash(true);
    const [{ notes }, { reminders }] = await Promise.all([
      fetchTrashedNotes(),
      fetchTrashedReminders(),
    ]);
    setTrashedNotes(notes);
    setTrashedReminders(reminders);
  };

  const handleRestoreNote = async (id: string) => {
    await restoreTrashedNote(id);
    setTrashedNotes((prev) => prev.filter((n) => n.id !== id));
    await notesState.refresh();
  };

  const handleRestoreReminder = async (id: string) => {
    await restoreTrashedReminder(id);
    setTrashedReminders((prev) => prev.filter((r) => r.id !== id));
    await remindersState.refresh();
  };

  return (
    <div className="finanzas-hub notes-hub">
      <div className="finanzas-view">
        {view === 'notes' && <NotesList {...notesState} />}
        {view === 'reminders' && <RemindersView {...remindersState} />}
      </div>

      <button
        type="button"
        className="btn-secondary btn-sm notes-trash-open-btn"
        onClick={() => void openTrash()}
      >
        Papelera
      </button>

      {showTrash && (
        <NotesTrashPanel
          trashedNotes={trashedNotes}
          trashedReminders={trashedReminders}
          onRestoreNote={handleRestoreNote}
          onRestoreReminder={handleRestoreReminder}
          onClose={() => setShowTrash(false)}
        />
      )}

      <nav className="finanzas-pill-nav" aria-label="Cambiar de vista">
        <button
          type="button"
          className={`finanzas-pill-btn ${view === 'notes' ? 'active' : ''}`}
          onClick={() => setView('notes')}
          aria-label="Notas"
        >
          <ActionIcon name="note" />
        </button>
        <button
          type="button"
          className={`finanzas-pill-btn ${view === 'reminders' ? 'active' : ''}`}
          onClick={() => setView('reminders')}
          aria-label="Recordatorios"
        >
          <ActionIcon name="bell" />
        </button>
      </nav>
    </div>
  );
}
