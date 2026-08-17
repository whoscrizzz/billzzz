import { useEffect, useRef, useState } from 'react';
import { currentDueAmount } from '../lib/due-dates-json';
import { paymentDateForSubscription } from '../lib/due-dates';
import type { MarkPaidInput, Subscription } from '../types/subscription';

interface Props {
  subscription: Subscription;
  onConfirm: (input: MarkPaidInput) => void;
  onClose: () => void;
  /** fx_usd_mxn actual de Ajustes — solo precarga el campo, editable por pago. */
  defaultFxUsdMxn?: number | null;
}

export function MarkPaidModal({ subscription, onConfirm, onClose, defaultFxUsdMxn }: Props) {
  const [amount, setAmount] = useState(String(currentDueAmount(subscription)));
  const [paidDate, setPaidDate] = useState(() => paymentDateForSubscription(subscription));
  const [notes, setNotes] = useState('');
  const [fxRate, setFxRate] = useState(defaultFxUsdMxn != null ? String(defaultFxUsdMxn) : '');
  const [formError, setFormError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isUsd = subscription.currency === 'USD';

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Antes esto sustituía un monto vacío por currentDueAmount() en silencio
    // — si lo borraste a propósito no había forma de saberlo. Ahora se pide
    // un monto válido en vez de adivinar uno.
    const trimmed = amount.trim();
    const parsed = trimmed ? parseFloat(trimmed) : NaN;
    if (trimmed === '' || Number.isNaN(parsed) || parsed < 0) {
      setFormError('Ingresa un monto válido.');
      return;
    }

    const trimmedFx = fxRate.trim();
    const parsedFx = trimmedFx ? parseFloat(trimmedFx) : null;
    if (
      isUsd &&
      trimmedFx !== '' &&
      (parsedFx == null || Number.isNaN(parsedFx) || parsedFx <= 0)
    ) {
      setFormError('Ingresa un tipo de cambio válido.');
      return;
    }

    setFormError(null);
    onConfirm({
      amount: parsed,
      paid_at: paidDate,
      notes: notes.trim() || undefined,
      ...(isUsd ? { fx_usd_mxn: parsedFx } : {}),
    });
    onClose();
  };

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <form className="modal-card" onSubmit={submit}>
        <h3>Marcar pagado — {subscription.name}</h3>
        <label>
          Monto pagado
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          Fecha de pago
          <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
        </label>
        {isUsd && (
          <label>
            Tipo de cambio USD→MXN (opcional)
            <input
              type="number"
              min="0"
              step="0.0001"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              placeholder="Sin conversión"
            />
          </label>
        )}
        <label>
          Notas (opcional)
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Referencia, folio…"
          />
        </label>
        {formError && <p className="banner error">{formError}</p>}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            Confirmar
          </button>
        </div>
      </form>
    </dialog>
  );
}
