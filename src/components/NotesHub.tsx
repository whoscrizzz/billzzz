import { useEffect, useState } from 'react';
import { NotesList } from './NotesList';
import { NotesTrashPanel } from './NotesTrashPanel';
import { RemindersView } from './RemindersView';
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

export function NotesHub() {
  const notes = useNotes(true);
  const reminders = useReminders(true);
  const [view, setView] = useState<NotesView>('notes');
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashedNotes, setTrashedNotes] = useState<Note[]>([]);
  const [trashedReminders, setTrashedReminders] = useState<Reminder[]>([]);
  const [trashError, setTrashError] = useState<string | null>(null);

  const loadTrash = async () => {
    setTrashError(null);
    try {
      const [notesResponse, remindersResponse] = await Promise.all([
        fetchTrashedNotes(),
        fetchTrashedReminders(),
      ]);
      setTrashedNotes(notesResponse.notes);
      setTrashedReminders(remindersResponse.reminders);
    } catch (error) {
      setTrashError(error instanceof Error ? error.message : 'No se pudo cargar la papelera');
    }
  };

  useEffect(() => {
    void loadTrash();
  }, []);

  const handleRestoreNote = async (id: string) => {
    await restoreTrashedNote(id);
    await Promise.all([loadTrash(), notes.refresh()]);
  };

  const handleRestoreReminder = async (id: string) => {
    await restoreTrashedReminder(id);
    await Promise.all([loadTrash(), reminders.refresh()]);
  };

  return (
    <section className="notes-hub" aria-labelledby="notes-hub-title">
      <div className="notes-row-between">
        <div>
          <p className="topbar-eyebrow">Organiza tu día</p>
          <h1 id="notes-hub-title" className="notes-page-title">
            Notes+
          </h1>
        </div>
        <button
          type="button"
          className="notes-trash-open-btn btn-secondary btn-sm"
          onClick={() => {
            setTrashOpen(true);
            void loadTrash();
          }}
        >
          Papelera
        </button>
      </div>

      <div className="notes-view-tabs" role="tablist" aria-label="Secciones de Notes+">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'notes'}
          className={`notes-view-tab ${view === 'notes' ? 'active' : ''}`}
          onClick={() => setView('notes')}
        >
          Notas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'reminders'}
          className={`notes-view-tab ${view === 'reminders' ? 'active' : ''}`}
          onClick={() => setView('reminders')}
        >
          Recordatorios
        </button>
      </div>

      {trashError && <p className="notes-pending-hint">{trashError}</p>}

      {view === 'notes' ? <NotesList {...notes} /> : <RemindersView {...reminders} />}

      {trashOpen && (
        <NotesTrashPanel
          trashedNotes={trashedNotes}
          trashedReminders={trashedReminders}
          onRestoreNote={handleRestoreNote}
          onRestoreReminder={handleRestoreReminder}
          onClose={() => setTrashOpen(false)}
        />
      )}
    </section>
  );
}
