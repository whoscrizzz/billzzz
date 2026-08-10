import { useMemo, useState } from 'react';
import { NoteEditor } from './NoteEditor';
import { categoryColor } from '../lib/categories';
import type { Note, NoteInput } from '../types/notes';

interface Props {
  notes: Note[];
  loading: boolean;
  error: string | null;
  pendingCount: number;
  add: (input: NoteInput) => Promise<void>;
  update: (id: string, input: Partial<NoteInput>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function formatNoteDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/** Port de notesListScreen() (Notes+/js/app.js) — búsqueda + chips de
 * categoría (derivados de las categorías reales en uso, no un enum fijo de
 * 3 como el original: la categoría de una nota es texto libre pintado con
 * categoryColor(), ver migración 0018). */
export function NotesList({ notes, loading, error, pendingCount, add, update, remove }: Props) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(notes.map((n) => n.category).filter((c): c is string => !!c))).sort(),
    [notes]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes
      .filter((n) => categoryFilter === 'all' || n.category === categoryFilter)
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [notes, search, categoryFilter]);

  if (isCreating || editingNote) {
    const closeEditor = () => {
      setIsCreating(false);
      setEditingNote(null);
    };
    return (
      <NoteEditor
        note={editingNote}
        categories={categories}
        onSave={async (input) => {
          if (editingNote) {
            await update(editingNote.id, input);
          } else {
            await add(input);
          }
          closeEditor();
        }}
        onDelete={
          editingNote
            ? async () => {
                await remove(editingNote.id);
                closeEditor();
              }
            : undefined
        }
        onCancel={closeEditor}
      />
    );
  }

  return (
    <div className="notes-list-screen">
      <div className="notes-row-between">
        <h2 className="notes-page-title">Notas</h2>
        <button
          type="button"
          className="notes-new-btn"
          onClick={() => setIsCreating(true)}
          aria-label="Nueva nota"
        >
          +
        </button>
      </div>

      {pendingCount > 0 && (
        <p className="notes-pending-hint">{pendingCount} cambio(s) pendientes de sincronizar</p>
      )}
      {error && <p className="notes-pending-hint">{error}</p>}

      <input
        className="search-input"
        placeholder="Buscar notas"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {categories.length > 0 && (
        <div className="notes-chip-row">
          <button
            type="button"
            className={`notes-chip ${categoryFilter === 'all' ? 'active' : ''}`}
            aria-pressed={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
          >
            Todas
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`notes-chip ${categoryFilter === cat ? 'active' : ''}`}
              aria-pressed={categoryFilter === cat}
              style={
                categoryFilter === cat
                  ? { background: categoryColor(cat), color: '#fff' }
                  : undefined
              }
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="chart-empty-caption">Cargando…</p>
      ) : filtered.length === 0 ? (
        <p className="empty-state">Sin notas todavía.</p>
      ) : (
        <ul className="notes-item-list">
          {filtered.map((n) => (
            <li key={n.id} className="notes-item" onClick={() => setEditingNote(n)}>
              <span
                className="notes-item-dot"
                style={{ background: categoryColor(n.category ?? '') }}
                aria-hidden
              />
              <span className="notes-item-body">
                <span className="notes-item-title">{n.title}</span>
                <span className="notes-item-snippet">{n.body.slice(0, 60)}</span>
              </span>
              <span className="notes-item-date">{formatNoteDate(n.updated_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
