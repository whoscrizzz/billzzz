import { useEffect, useState } from 'react';
import { NotesList } from './NotesList';
import { NotesTrashPanel } from './NotesTrashPanel';
import { useNotes } from '../hooks/useNotes';
import { fetchTrashedNotes, restoreTrashedNote } from '../lib/api';
import type { Note } from '../types/notes';

export function NotesHub() {
  const notes = useNotes(true);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashedNotes, setTrashedNotes] = useState<Note[]>([]);
  const [trashError, setTrashError] = useState<string | null>(null);

  const loadTrash = async () => {
    setTrashError(null);
    try {
      const notesResponse = await fetchTrashedNotes();
      setTrashedNotes(notesResponse.notes);
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

  return (
    <section className="notes-hub" aria-labelledby="notes-hub-title">
      <div className="notes-row-between">
        <div>
          <p className="topbar-eyebrow">Organiza tu día</p>
          <h1 id="notes-hub-title" className="notes-page-title">
            Facturas
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

      {trashError && <p className="notes-pending-hint">{trashError}</p>}

      <NotesList {...notes} />

      {trashOpen && (
        <NotesTrashPanel
          trashedNotes={trashedNotes}
          trashedReminders={[]}
          onRestoreNote={handleRestoreNote}
          onRestoreReminder={async () => {}}
          onClose={() => setTrashOpen(false)}
        />
      )}
    </section>
  );
}
