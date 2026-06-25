import { useEffect, useRef, useState } from "react";
import type { MarkPaidInput, Subscription } from "../types/subscription";

interface Props {
  subscription: Subscription;
  onConfirm: (input: MarkPaidInput) => void;
  onClose: () => void;
}

export function MarkPaidModal({ subscription, onConfirm, onClose }: Props) {
  const [amount, setAmount] = useState(String(subscription.amount));
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({
      amount: parseFloat(amount) || subscription.amount,
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
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Fecha de pago
          <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
        </label>
        <label>
          Notas (opcional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Referencia, folio…" />
        </label>
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
