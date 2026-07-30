import { useEffect, useMemo, useRef, useState } from 'react';
import type { DueDateEntry, Frequency, IntervalUnit } from '../types/subscription';
import { describeRecurrence, nextNDueDates } from '../lib/due-dates';
import { serializeDueDates, serializeDueDays } from '../lib/due-dates-json';
import { localIsoDate } from '../lib/local-date';
import { MultiDateChips } from './MultiDateChips';
import { WeekdayPills } from './WeekdayPills';

export interface RecurrenceDraft {
  frequency: Frequency;
  due_day: number;
  due_date: string;
  due_dates: DueDateEntry[];
  due_days: number[];
  interval_count: number | null;
  interval_unit: IntervalUnit | null;
}

type RecurrenceKind =
  'once' | 'weekly' | 'quincenal' | 'monthly' | 'bimestral' | 'yearly' | 'multi';

const KIND_OPTIONS: { value: RecurrenceKind; label: string }[] = [
  { value: 'once', label: 'Único' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'yearly', label: 'Anual' },
  { value: 'multi', label: 'Varias fechas' },
];

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

function kindFromDraft(draft: RecurrenceDraft): RecurrenceKind {
  if (draft.due_dates.length > 0) return 'multi';
  if (draft.frequency === 'interval') {
    if (draft.interval_count === 2 && draft.interval_unit === 'month') return 'bimestral';
    return 'quincenal';
  }
  if (
    draft.frequency === 'once' ||
    draft.frequency === 'weekly' ||
    draft.frequency === 'monthly' ||
    draft.frequency === 'yearly'
  ) {
    return draft.frequency;
  }
  return 'monthly';
}

function formatPreviewDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

interface Props {
  draft: RecurrenceDraft;
  baseAmount?: number;
  onSave: (draft: RecurrenceDraft) => void;
  onClose: () => void;
}

export function RecurrenceSheet({ draft, baseAmount, onSave, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<RecurrenceKind>(() => kindFromDraft(draft));
  const [weekday, setWeekday] = useState(() =>
    String(draft.frequency === 'weekly' ? draft.due_day : 1)
  );
  const [dueDate, setDueDate] = useState(draft.due_date || localIsoDate());
  const [monthDays, setMonthDays] = useState<number[]>(() =>
    draft.due_days.length > 0 ? draft.due_days : [draft.due_day || 1]
  );
  const [extraDates, setExtraDates] = useState<DueDateEntry[]>(draft.due_dates);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const toggleMonthDay = (day: number) => {
    setMonthDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const previewSub = useMemo(() => {
    const base = {
      frequency: 'monthly' as Frequency,
      due_day: 1,
      due_date: null as string | null,
      due_dates: null as string | null,
      due_days: null as string | null,
      interval_count: null as number | null,
      interval_unit: null as IntervalUnit | null,
      created_at: new Date().toISOString(),
      snoozed_until: null as string | null,
    };
    switch (kind) {
      case 'once':
        return { ...base, frequency: 'once' as Frequency, due_date: dueDate };
      case 'weekly':
        return { ...base, frequency: 'weekly' as Frequency, due_day: parseInt(weekday, 10) };
      case 'monthly':
        return monthDays.length > 1
          ? { ...base, frequency: 'monthly' as Frequency, due_days: serializeDueDays(monthDays) }
          : { ...base, frequency: 'monthly' as Frequency, due_day: monthDays[0] ?? 1 };
      case 'quincenal':
        return {
          ...base,
          frequency: 'interval' as Frequency,
          interval_count: 15,
          interval_unit: 'day' as IntervalUnit,
          due_date: dueDate,
        };
      case 'bimestral':
        return {
          ...base,
          frequency: 'interval' as Frequency,
          interval_count: 2,
          interval_unit: 'month' as IntervalUnit,
          due_date: dueDate,
        };
      case 'yearly':
        return { ...base, frequency: 'yearly' as Frequency, due_date: dueDate };
      case 'multi':
        return { ...base, due_dates: serializeDueDates(extraDates) };
      default:
        return base;
    }
  }, [kind, weekday, dueDate, monthDays, extraDates]);

  const summary = describeRecurrence(previewSub);
  const nextDates = nextNDueDates(previewSub, 3);
  const canSave = kind !== 'multi' || extraDates.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    switch (kind) {
      case 'once':
        onSave({
          frequency: 'once',
          due_date: dueDate,
          due_day: parseInt(dueDate.slice(8, 10), 10),
          due_dates: [],
          due_days: [],
          interval_count: null,
          interval_unit: null,
        });
        return;
      case 'weekly':
        onSave({
          frequency: 'weekly',
          due_date: '',
          due_day: parseInt(weekday, 10),
          due_dates: [],
          due_days: [],
          interval_count: null,
          interval_unit: null,
        });
        return;
      case 'monthly':
        onSave({
          frequency: 'monthly',
          due_date: monthDays.length > 1 ? '' : dueDate,
          due_day: monthDays.length > 1 ? monthDays[0] : (monthDays[0] ?? 1),
          due_dates: [],
          due_days: monthDays.length > 1 ? monthDays : [],
          interval_count: null,
          interval_unit: null,
        });
        return;
      case 'quincenal':
        onSave({
          frequency: 'interval',
          due_date: dueDate,
          due_day: parseInt(dueDate.slice(8, 10), 10),
          due_dates: [],
          due_days: [],
          interval_count: 15,
          interval_unit: 'day',
        });
        return;
      case 'bimestral':
        onSave({
          frequency: 'interval',
          due_date: dueDate,
          due_day: parseInt(dueDate.slice(8, 10), 10),
          due_dates: [],
          due_days: [],
          interval_count: 2,
          interval_unit: 'month',
        });
        return;
      case 'yearly':
        onSave({
          frequency: 'yearly',
          due_date: dueDate,
          due_day: parseInt(dueDate.slice(8, 10), 10),
          due_dates: [],
          due_days: [],
          interval_count: null,
          interval_unit: null,
        });
        return;
      case 'multi':
        onSave({
          frequency: draft.frequency === 'interval' ? 'monthly' : draft.frequency,
          due_date: extraDates[0]?.date ?? dueDate,
          due_day: extraDates[0] ? parseInt(extraDates[0].date.slice(8, 10), 10) : draft.due_day,
          due_dates: extraDates,
          due_days: [],
          interval_count: null,
          interval_unit: null,
        });
    }
  };

  return (
    <dialog ref={dialogRef} className="modal recurrence-sheet" onClose={onClose}>
      <div className="modal-card">
        <h3>Recordatorio</h3>
        <div className="date-presets">
          <div className="date-preset-row">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`date-preset-btn ${kind === opt.value ? 'active' : ''}`}
                onClick={() => setKind(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {kind === 'weekly' && (
          <label>
            Día de la semana
            <WeekdayPills value={weekday} onChange={setWeekday} />
          </label>
        )}

        {(kind === 'once' || kind === 'quincenal' || kind === 'bimestral' || kind === 'yearly') && (
          <label>
            {kind === 'once' ? 'Fecha de pago' : 'Ancla (primera fecha)'}
            <input
              required
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
        )}

        {kind === 'monthly' && (
          <div className="month-day-grid-field">
            <span className="field-label">Día(s) del mes</span>
            <div className="date-preset-row">
              <button
                type="button"
                className="date-preset-btn"
                onClick={() => setMonthDays([1, 15])}
              >
                Quincenas (1 y 15)
              </button>
              <button type="button" className="date-preset-btn" onClick={() => setMonthDays([31])}>
                Fin de mes
              </button>
              <button type="button" className="date-preset-btn" onClick={() => setMonthDays([])}>
                Limpiar
              </button>
            </div>
            <div className="month-day-grid">
              {DAYS_OF_MONTH.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={`month-day-cell ${monthDays.includes(day) ? 'active' : ''}`}
                  onClick={() => toggleMonthDay(day)}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}

        {kind === 'multi' && (
          <MultiDateChips dates={extraDates} onChange={setExtraDates} baseAmount={baseAmount} />
        )}

        <div className="recurrence-summary">
          <span className="field-label">Resumen</span>
          <p>{summary}</p>
          {nextDates.length > 0 && (
            <p className="recurrence-summary-next">
              Próximas: {nextDates.map(formatPreviewDate).join(' · ')}
            </p>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSave}>
            Guardar recordatorio
          </button>
        </div>
      </div>
    </dialog>
  );
}
