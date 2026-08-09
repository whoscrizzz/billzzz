import { useState } from 'react';
import { ActionIcon } from './ActionIcon';
import { NotesList } from './NotesList';
import { RemindersView } from './RemindersView';
import { useNotes } from '../hooks/useNotes';
import { useReminders } from '../hooks/useReminders';

type NotesView = 'notes' | 'reminders';

/** Contenedor con pill-nav de 2 vistas, mismo patrón que FinanzasHub.tsx
 * (mismo selector flotante de iconos). Vive como pestaña nueva ('notes') en
 * el nav existente — port de Notes+ (app standalone separada). */
export function NotesHub() {
  const [view, setView] = useState<NotesView>('notes');
  const notesState = useNotes(true);
  const remindersState = useReminders(true);

  return (
    <div className="finanzas-hub notes-hub">
      <div className="finanzas-view">
        {view === 'notes' && <NotesList {...notesState} />}
        {view === 'reminders' && <RemindersView {...remindersState} />}
      </div>

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
