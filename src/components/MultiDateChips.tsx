import { useState } from 'react';
import { ActionIcon } from './ActionIcon';
import type { DueDateEntry } from '../types/subscription';

interface Props {
  dates: DueDateEntry[];
  onChange: (dates: DueDateEntry[]) => void;
  label?: string;
  /** Monto base de la suscripción — placeholder para el monto de cada fecha. */
  baseAmount?: number;
}

export function MultiDateChips({ dates, onChange, label = 'Fechas de pago', baseAmount }: Props) {
  const [draft, setDraft] = useState('');

  const addDate = () => {
    if (!draft || dates.some((d) => d.date === draft)) return;
    onChange([...dates, { date: draft }].sort((a, b) => a.date.localeCompare(b.date)));
    setDraft('');
  };

  const removeDate = (date: string) => {
    onChange(dates.filter((d) => d.date !== date));
  };

  const setAmount = (date: string, value: string) => {
    const amount = value.trim() ? parseFloat(value) : undefined;
    onChange(
      dates.map((d) =>
        d.date === date
          ? amount != null && Number.isFinite(amount)
            ? { date, amount }
            : { date }
          : d
      )
    );
  };

  return (
    <div className="multi-date-field">
      <span className="field-label">{label}</span>
      <p className="field-hint">
        Agrega cada fecha por separado. Si una fecha tiene un monto distinto, captúralo — si lo
        dejas vacío usa el monto base.
      </p>
      <div className="multi-date-input-row">
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Agregar fecha"
        />
        <button type="button" className="btn-secondary btn-sm" onClick={addDate} disabled={!draft}>
          + Agregar
        </button>
      </div>
      {dates.length > 0 && (
        <ul className="multi-date-rows">
          {dates.map((d) => (
            <li key={d.date} className="multi-date-row">
              <span className="multi-date-row-date">{formatChipDate(d.date)}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="multi-date-row-amount"
                value={d.amount ?? ''}
                placeholder={baseAmount != null ? String(baseAmount) : 'Monto'}
                aria-label={`Monto para ${formatChipDate(d.date)}`}
                onChange={(e) => setAmount(d.date, e.target.value)}
              />
              <button
                type="button"
                className="chip-remove"
                aria-label={`Quitar ${d.date}`}
                onClick={() => removeDate(d.date)}
              >
                <ActionIcon name="close" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatChipDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
