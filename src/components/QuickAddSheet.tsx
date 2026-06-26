import { useEffect, useRef, useState } from "react";
import type { SubscriptionInput } from "../types/subscription";
import { addLocalDays } from "../lib/local-date";
import { CurrencyAmountInput } from "./CurrencyAmountInput";

interface Props {
  onSubmit: (input: SubscriptionInput) => Promise<void>;
  onClose: () => void;
}

export function QuickAddSheet({ onSubmit, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [dueDate, setDueDate] = useState(addLocalDays(7));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        amount: parseFloat(amount),
        currency,
        frequency: "monthly",
        due_date: dueDate,
        notify_days_before: 1,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="modal quick-add-sheet" onClose={onClose}>
      <form className="modal-card" onSubmit={submit}>
        <h3>Registrar rápido</h3>
        <label>
          Nombre
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Netflix, renta…"
          />
        </label>
        <CurrencyAmountInput
          amount={amount}
          currency={currency}
          onAmountChange={setAmount}
          onCurrencyChange={setCurrency}
        />
        <div className="date-presets">
          <span className="field-label">Vence</span>
          <div className="date-preset-row">
            {[
              { label: "Hoy", days: 0 },
              { label: "Mañana", days: 1 },
              { label: "7 días", days: 7 },
            ].map((p) => (
              <button
                key={p.days}
                type="button"
                className={`date-preset-btn ${dueDate === addLocalDays(p.days) ? "active" : ""}`}
                onClick={() => setDueDate(addLocalDays(p.days))}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
