import { useMemo, useState } from 'react';
import type { Reminder, ReminderInput } from '../types/notes';

interface Props {
  reminders: Reminder[];
  loading: boolean;
  error: string | null;
  add: (input: ReminderInput) => Promise<void>;
  update: (
    id: string,
    input: Partial<{ title: string; due_at: string; done: boolean }>
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString();
}

function formatReminderTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Hoy · ${time}`;
  return `${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · ${time}`;
}

/** Port de remindersScreen() (Notes+/js/app.js). Se cayeron la sección de
 * "conectar correo/webcal" y el botón de permisos de Notification: acá el
 * aviso lo manda el cron del Worker (worker/src/reminder-notifications.ts),
 * así que llega con la app cerrada y no depende de este navegador. */
export function RemindersView({ reminders, loading, error, add, update, remove }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  const { today, upcoming } = useMemo(() => {
    const sorted = [...reminders].sort((a, b) => a.due_at.localeCompare(b.due_at));
    return {
      today: sorted.filter((r) => isToday(r.due_at)),
      upcoming: sorted.filter((r) => !isToday(r.due_at)),
    };
  }, [reminders]);

  const handleAdd = async () => {
    if (!title.trim() || !date) return;
    setSaving(true);
    try {
      const dueAt = new Date(`${date}T${time || '09:00'}`).toISOString();
      await add({ title: title.trim(), due_at: dueAt });
      setTitle('');
      setDate('');
      setTime('');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = (r: Reminder) => (
    <li key={r.id} className="notes-reminder-item">
      <button
        type="button"
        className={`notes-reminder-check ${r.done ? 'done' : ''}`}
        aria-pressed={r.done === 1}
        aria-label={r.done ? 'Marcar como pendiente' : 'Marcar como hecho'}
        onClick={() => void update(r.id, { done: r.done !== 1 })}
      />
      <span className="notes-reminder-body">
        <span className={`notes-reminder-title ${r.done ? 'done' : ''}`}>{r.title}</span>
        <span className="notes-reminder-time">{formatReminderTime(r.due_at)}</span>
      </span>
      <button
        type="button"
        className="notes-reminder-delete"
        aria-label={`Eliminar ${r.title}`}
        onClick={() => void remove(r.id)}
      >
        ✕
      </button>
    </li>
  );

  return (
    <div className="notes-reminders-screen">
      <h2 className="notes-page-title">Recordatorios</h2>
      {error && <p className="notes-pending-hint">{error}</p>}

      <div className="card notes-reminder-form">
        <input
          className="notes-title-field"
          placeholder="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="notes-date-row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <button
          type="button"
          className="notes-add-btn"
          onClick={() => void handleAdd()}
          disabled={saving || !title.trim() || !date}
        >
          Agregar
        </button>
      </div>

      {loading ? (
        <p className="chart-empty-caption">Cargando…</p>
      ) : (
        <>
          <h3 className="section-title">Hoy</h3>
          <ul className="notes-reminder-list">
            {today.length > 0 ? (
              today.map(renderItem)
            ) : (
              <li className="empty-state">Nada para hoy 🎉</li>
            )}
          </ul>

          <h3 className="section-title">Próximos</h3>
          <ul className="notes-reminder-list">
            {upcoming.length > 0 ? (
              upcoming.map(renderItem)
            ) : (
              <li className="empty-state">Sin recordatorios próximos.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
