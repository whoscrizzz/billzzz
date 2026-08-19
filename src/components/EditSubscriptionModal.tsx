import { useEffect, useRef, useState } from 'react';
import type { Subscription, SubscriptionInput } from '../types/subscription';
import { CATEGORIES } from '../lib/categories';
import { getTimezoneLabel, NOTIFY_TIMEZONE } from '../lib/notify-timezone';
import { describeRecurrence } from '../lib/due-dates';
import {
  parseDueDates,
  parseDueDaysList,
  serializeDueDates,
  serializeDueDays,
} from '../lib/due-dates-json';
import { CurrencyAmountInput } from './CurrencyAmountInput';
import { RecurrenceSheet, type RecurrenceDraft } from './RecurrenceSheet';

interface Props {
  subscription: Subscription;
  onSubmit: (input: Partial<SubscriptionInput>) => Promise<void>;
  onClose: () => void;
  onDelete: (id: string) => void;
  timezone?: string;
}

const hours = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, '0')}:00`,
}));

export function EditSubscriptionModal({
  subscription,
  onSubmit,
  onClose,
  onDelete,
  timezone = NOTIFY_TIMEZONE,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(subscription.name);
  const [amount, setAmount] = useState(String(subscription.amount));
  const [currency, setCurrency] = useState(subscription.currency);
  const [recurrence, setRecurrence] = useState<RecurrenceDraft>(() => ({
    frequency: subscription.frequency,
    due_day: subscription.due_day,
    due_date: subscription.due_date ?? '',
    due_dates: parseDueDates(subscription),
    due_days: parseDueDaysList(subscription),
    interval_count: subscription.interval_count,
    interval_unit: subscription.interval_unit,
  }));
  const [showRecurrenceSheet, setShowRecurrenceSheet] = useState(false);
  const [category, setCategory] = useState(subscription.category ?? '');
  const [notes, setNotes] = useState(subscription.notes ?? '');
  const [notifyDays, setNotifyDays] = useState(String(subscription.notify_days_before));
  const [notifyHour, setNotifyHour] = useState(String(subscription.notify_hour ?? 9));
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const recurrenceLabel = describeRecurrence({
    frequency: recurrence.frequency,
    due_day: recurrence.due_day,
    due_date: recurrence.due_date || null,
    due_dates: recurrence.due_dates.length > 0 ? serializeDueDates(recurrence.due_dates) : null,
    due_days: recurrence.due_days.length > 0 ? serializeDueDays(recurrence.due_days) : null,
    interval_count: recurrence.interval_count,
    interval_unit: recurrence.interval_unit,
    created_at: subscription.created_at,
    snoozed_until: null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit({
        name: name.trim(),
        amount: parseFloat(amount),
        currency,
        frequency: recurrence.frequency,
        due_date: recurrence.due_date || null,
        due_day: recurrence.due_day,
        due_dates: recurrence.due_dates,
        due_days: recurrence.due_days,
        interval_count: recurrence.interval_count,
        interval_unit: recurrence.interval_unit,
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
        <label>
          Recurrencia
          <button
            type="button"
            className="btn-secondary recurrence-trigger"
            onClick={() => setShowRecurrenceSheet(true)}
          >
            {recurrenceLabel}
          </button>
        </label>
        {showRecurrenceSheet && (
          <RecurrenceSheet
            draft={recurrence}
            baseAmount={parseFloat(amount) || undefined}
            onSave={(next) => {
              setRecurrence(next);
              setShowRecurrenceSheet(false);
            }}
            onClose={() => setShowRecurrenceSheet(false)}
          />
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
          <button
            type="button"
            className="btn-danger"
            style={{ marginRight: 'auto' }}
            onClick={() => {
              onClose();
              onDelete(subscription.id);
            }}
          >
            Eliminar pago
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
