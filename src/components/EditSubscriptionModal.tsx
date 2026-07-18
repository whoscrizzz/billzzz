import { useEffect, useRef, useState } from 'react';
import type { Frequency, Subscription, SubscriptionInput } from '../types/subscription';
import { CATEGORIES } from '../lib/categories';
import { getTimezoneLabel, NOTIFY_TIMEZONE } from '../lib/notify-timezone';
import { localIsoDate } from '../lib/local-date';
import { parseDueDates } from '../lib/due-dates-json';
import { CurrencyAmountInput } from './CurrencyAmountInput';
import { MultiDateChips } from './MultiDateChips';
import { WeekdayPills } from './WeekdayPills';

interface Props {
  subscription: Subscription;
  onSubmit: (input: Partial<SubscriptionInput>) => Promise<void>;
  onClose: () => void;
  timezone?: string;
}

const frequencies: { value: Frequency; label: string }[] = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'yearly', label: 'Anual' },
  { value: 'once', label: 'Pago único' },
];

const hours = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, '0')}:00`,
}));

export function EditSubscriptionModal({
  subscription,
  onSubmit,
  onClose,
  timezone = NOTIFY_TIMEZONE,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(subscription.name);
  const [amount, setAmount] = useState(String(subscription.amount));
  const [currency, setCurrency] = useState(subscription.currency);
  const [extraDates, setExtraDates] = useState(() => parseDueDates(subscription));
  const [multiDateMode, setMultiDateMode] = useState(() => !!subscription.due_dates);
  const [dueDate, setDueDate] = useState(subscription.due_date ?? localIsoDate());
  const [weekday, setWeekday] = useState(String(subscription.due_day || 1));
  const [frequency, setFrequency] = useState(subscription.frequency);
  const [category, setCategory] = useState(subscription.category ?? '');
  const [notes, setNotes] = useState(subscription.notes ?? '');
  const [notifyDays, setNotifyDays] = useState(String(subscription.notify_days_before));
  const [notifyHour, setNotifyHour] = useState(String(subscription.notify_hour ?? 9));
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (multiDateMode && extraDates.length === 0) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit({
        name: name.trim(),
        amount: parseFloat(amount),
        currency,
        frequency,
        due_date: frequency === 'weekly' ? undefined : dueDate,
        due_day:
          frequency === 'weekly' ? parseInt(weekday, 10) : parseInt(dueDate.slice(8, 10), 10),
        due_dates: multiDateMode && extraDates.length > 0 ? extraDates : [],
        category: category.trim() || undefined,
        notes: notes.trim() || undefined,
        notify_days_before: parseInt(notifyDays, 10) || 1,
        notify_hour: parseInt(notifyHour, 10) || 9,
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo guardar el pago');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <form className="modal-card" onSubmit={handleSubmit}>
        <h3>Editar pago</h3>
        <label>
          Nombre
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <CurrencyAmountInput
          amount={amount}
          currency={currency}
          onAmountChange={setAmount}
          onCurrencyChange={setCurrency}
        />
        <div className="form-row">
          <label>
            Frecuencia
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {frequencies.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={multiDateMode}
            onChange={(e) => {
              setMultiDateMode(e.target.checked);
              if (e.target.checked && extraDates.length === 0) {
                setExtraDates([dueDate]);
              }
            }}
          />
          Varias fechas en este pago
        </label>
        {multiDateMode ? (
          <MultiDateChips dates={extraDates} onChange={setExtraDates} />
        ) : frequency === 'weekly' ? (
          <label>
            Día de la semana
            <WeekdayPills value={weekday} onChange={setWeekday} />
          </label>
        ) : (
          <label>
            Fecha de pago
            <input
              required
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
        )}
        <label>
          Categoría
          <input
            list="edit-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="edit-categories">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <div className="form-row">
          <label>
            Avisar (días antes)
            <input
              type="number"
              min="0"
              max="30"
              value={notifyDays}
              onChange={(e) => setNotifyDays(e.target.value)}
            />
          </label>
          <label>
            Hora del aviso ({getTimezoneLabel(timezone)})
            <select value={notifyHour} onChange={(e) => setNotifyHour(e.target.value)}>
              {hours.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Notas
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {submitError && <p className="banner error">{submitError}</p>}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || (multiDateMode && extraDates.length === 0)}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
