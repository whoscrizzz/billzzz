import { useEffect, useRef, useState } from 'react';
import type { Note, Reminder } from '../types/notes';

interface Props {
  trashedNotes: Note[];
  trashedReminders: Reminder[];
  onRestoreNote: (id: string) => Promise<void>;
  onRestoreReminder: (id: string) => Promise<void>;
  onClose: () => void;
}

/** Papelera combinada de notas y recordatorios — un solo modal con dos
 * secciones, en vez de duplicar el dialog de TrashPanel.tsx (subscriptions)
 * dos veces más: notas y recordatorios comparten el mismo alcance de
 * "Notes+" y se restauran igual (UPDATE trashed_at = NULL). */
export function NotesTrashPanel({
  trashedNotes,
  trashedReminders,
  onRestoreNote,
  onRestoreReminder,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const handleRestore = async (id: string, restore: (id: string) => Promise<void>) => {
    setRestoringId(id);
    try {
      await restore(id);
    } finally {
      setRestoringId(null);
    }
  };

  const empty = trashedNotes.length === 0 && trashedReminders.length === 0;

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-card">
        <h3>Papelera</h3>
        {empty ? (
          <p className="panel-hint">
            Vacía. Las notas y recordatorios que elimines quedan aquí 30 días antes de borrarse para
            siempre.
          </p>
        ) : (
          <>
            {trashedNotes.length > 0 && (
              <>
                <h4 className="section-title">Notas</h4>
                <ul className="completed-list">
                  {trashedNotes.map((note) => (
                    <li key={note.id} className="completed-row">
                      <div className="completed-row-main">
                        <p className="completed-name">{note.title}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={restoringId === note.id}
                        onClick={() => void handleRestore(note.id, onRestoreNote)}
                      >
                        {restoringId === note.id ? 'Restaurando…' : 'Restaurar'}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {trashedReminders.length > 0 && (
              <>
                <h4 className="section-title">Recordatorios</h4>
                <ul className="completed-list">
                  {trashedReminders.map((reminder) => (
                    <li key={reminder.id} className="completed-row">
                      <div className="completed-row-main">
                        <p className="completed-name">{reminder.title}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={restoringId === reminder.id}
                        onClick={() => void handleRestore(reminder.id, onRestoreReminder)}
                      >
                        {restoringId === reminder.id ? 'Restaurando…' : 'Restaurar'}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  );
}
