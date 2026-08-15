import { useEffect, useRef, useState } from 'react';
import { currentDueAmount } from '../lib/due-dates-json';
import { paymentDateForSubscription } from '../lib/due-dates';
import type { MarkPaidInput, Subscription } from '../types/subscription';

interface Props {
  subscription: Subscription;
  onConfirm: (input: MarkPaidInput) => void;
  onClose: () => void;
}

export function MarkPaidModal({ subscription, onConfirm, onClose }: Props) {
  const [amount, setAmount] = useState(String(currentDueAmount(subscription)));
  const [paidDate, setPaidDate] = useState(() => paymentDateForSubscription(subscription));
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

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
    setFormError(null);
    onConfirm({
      amount: parsed,
      paid_at: paidDate,
      notes: notes.trim() || undefined,
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
