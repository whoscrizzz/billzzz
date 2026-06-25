import { useState } from "react";
import type { Frequency, Subscription, SubscriptionInput } from "../types/subscription";
import { CATEGORIES } from "../lib/categories";

interface Props {
  subscription: Subscription;
  onSubmit: (input: Partial<SubscriptionInput>) => Promise<void>;
  onClose: () => void;
}

const frequencies: { value: Frequency; label: string }[] = [
  { value: "monthly", label: "Mensual" },
  { value: "weekly", label: "Semanal" },
  { value: "yearly", label: "Anual" },
  { value: "once", label: "Pago único" },
];

const hours = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, "0")}:00`,
}));

export function EditSubscriptionModal({ subscription, onSubmit, onClose }: Props) {
  const [name, setName] = useState(subscription.name);
  const [amount, setAmount] = useState(String(subscription.amount));
  const [dueDate, setDueDate] = useState(
    subscription.due_date ?? new Date().toISOString().slice(0, 10),
  );
  const [frequency, setFrequency] = useState(subscription.frequency);
  const [category, setCategory] = useState(subscription.category ?? "");
  const [notes, setNotes] = useState(subscription.notes ?? "");
  const [notifyDays, setNotifyDays] = useState(String(subscription.notify_days_before));
  const [notifyHour, setNotifyHour] = useState(String(subscription.notify_hour ?? 9));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        amount: parseFloat(amount),
        frequency,
        due_date: frequency === "weekly" ? undefined : dueDate,
        due_day: frequency === "weekly" ? subscription.due_day : undefined,
        category: category.trim() || undefined,
        notes: notes.trim() || undefined,
        notify_days_before: parseInt(notifyDays, 10) || 3,
        notify_hour: parseInt(notifyHour, 10) || 9,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog open className="modal" onClose={onClose}>
      <form className="modal-card" onSubmit={handleSubmit}>
        <h3>Editar pago</h3>
        <label>
          Nombre
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            Monto
            <input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
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
        {frequency !== "weekly" && (
          <label>
            Fecha de pago
            <input required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        )}
        <label>
          Categoría
          <input list="edit-categories" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="edit-categories">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <div className="form-row">
          <label>
            Avisar (días antes)
            <input type="number" min="0" max="30" value={notifyDays} onChange={(e) => setNotifyDays(e.target.value)} />
          </label>
          <label>
            Hora del evento
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
