import { useState } from 'react';
import { categoryColor } from '../lib/categories';
import type { Note, NoteInput } from '../types/notes';

interface Props {
  note: Note | null;
  /** Categorías ya en uso en las notas del usuario (las calcula NotesList).
   *  Deliberadamente NO incluye las de subscriptions: son taxonomías distintas
   *  ("clase", "ideas" vs. "Servicios", "Préstamos") y mezclarlas ensuciaría
   *  las dos. Lo que sí comparten es categoryColor(), así que una categoría
   *  con el mismo nombre se pinta igual en ambos lados sin forzar la lista. */
  categories?: string[];
  onSave: (input: NoteInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}

/** Port de noteEditorScreen() (Notes+/js/app.js). Categoría es texto libre
 * pintado con categoryColor() (migración 0018 — no el enum fijo de 3
 * categorías del original), así que en vez de una lista fija de chips se
 * ofrecen las categorías que el usuario ya usó, más un campo para escribir
 * una nueva. */
export function NoteEditor({ note, categories = [], onSave, onDelete, onCancel }: Props) {
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [category, setCategory] = useState(note?.category ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      onCancel();
      return;
    }
    setSaving(true);
    try {
      await onSave({ title: title.trim(), body, category: category.trim() || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="note-editor-screen">
      <div className="notes-editor-top">
        <button type="button" className="notes-editor-cancel" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="notes-editor-save"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          Guardar
        </button>
      </div>

      <input
        className="notes-title-input"
        placeholder="Título"
        aria-label="Título de la nota"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      <div className="note-editor-category-picker">
        {categories.length > 0 && (
          <div className="notes-chip-row" role="group" aria-label="Categoría">
            {categories.map((cat) => {
              const selected = category.trim().toLowerCase() === cat.toLowerCase();
              return (
                <button
                  key={cat}
                  type="button"
                  className={`notes-chip ${selected ? 'active' : ''}`}
                  aria-pressed={selected}
                  // Volver a tocar la categoría activa la quita: sin esto no
                  // habría forma de dejar la nota sin categoría desde los
                  // chips, solo borrando el texto del input.
                  onClick={() => setCategory(selected ? '' : cat)}
                  style={selected ? { background: categoryColor(cat), color: '#fff' } : undefined}
                >
                  <span
                    className="note-editor-category-dot"
                    style={{ background: categoryColor(cat) }}
                    aria-hidden
                  />
                  {cat}
                </button>
              );
            })}
          </div>
        )}

        <div className="note-editor-category-field">
          <span
            className="note-editor-category-dot"
            style={{ background: categoryColor(category) }}
            aria-hidden
          />
          <input
            className="note-editor-category-input"
            placeholder={categories.length > 0 ? 'O escribe una nueva…' : 'Categoría'}
            aria-label="Categoría de la nota"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="note-editor-categories"
            style={{ borderColor: category ? categoryColor(category) : undefined }}
          />
          {/* El datalist duplica a propósito lo que ya está en los chips: en
              móvil los chips pueden quedar fuera de vista al enfocar el input
              y el autocompletado del teclado es el camino más corto. */}
          <datalist id="note-editor-categories">
            {categories.map((cat) => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
          {category.trim() !== '' && (
            <button type="button" className="btn-text btn-text-sm" onClick={() => setCategory('')}>
              Quitar
            </button>
          )}
        </div>
      </div>

      <textarea
        className="notes-body-textarea"
        placeholder="Escribe aquí…"
        aria-label="Contenido de la nota"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      {onDelete && (
        <button type="button" className="notes-delete-note" onClick={() => void onDelete()}>
          Eliminar nota
        </button>
      )}
    </div>
  );
}
