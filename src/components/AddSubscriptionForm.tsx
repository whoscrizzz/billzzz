import { useState } from "react";
import type { Frequency, Subscription, SubscriptionInput } from "../types/subscription";
import { CATEGORIES } from "../lib/categories";
import type { QuickTemplate } from "../lib/quick-templates";
import { recordTemplateUse } from "../lib/template-suggestions";
import { QuickTemplatePicker } from "./QuickTemplatePicker";
import { ImportRemindersPanel } from "./ImportRemindersPanel";

interface Props {
  onSubmit: (input: SubscriptionInput) => Promise<void>;
  onImportMany: (inputs: SubscriptionInput[]) => Promise<void>;
  subscriptions: Subscription[];
  defaultOpen?: boolean;
}

const recurringFrequencies: { value: Frequency; label: string }[] = [
  { value: "monthly", label: "Mensual" },
  { value: "weekly", label: "Semanal" },
  { value: "yearly", label: "Anual" },
];

const weekdays: { value: string; label: string }[] = [
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miércoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sábado" },
  { value: "7", label: "Domingo" },
];

type BillKind = "recurring" | "once";

function defaultDueDate(daysAhead = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function AddSubscriptionForm({
  onSubmit,
  onImportMany,
  subscriptions,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [kind, setKind] = useState<BillKind>("recurring");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [weekday, setWeekday] = useState("1");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [notifyDays, setNotifyDays] = useState("3");
  const [notifyHour, setNotifyHour] = useState("9");
  const [currency, setCurrency] = useState("MXN");
  const [saving, setSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(true);
  const [entryMode, setEntryMode] = useState<"templates" | "import">("templates");

  const applyTemplate = (t: QuickTemplate) => {
    recordTemplateUse(t.id);
    setKind(t.kind);
    setFrequency(t.frequency);
    setCategory(t.category);
    setCurrency(t.currency);
    setNotifyDays(String(t.notify_days_before));
    setNotifyHour(String(t.notify_hour));
    setName("");
    setAmount("");
    setNotes("");
    if (t.weekday) setWeekday(String(t.weekday));
    if (t.frequency === "monthly") setDueDate(firstOfMonth());
    else setDueDate(defaultDueDate(t.frequency === "yearly" ? 30 : 7));
    setShowTemplates(false);
  };

  const reset = () => {
    setName("");
    setAmount("");
    setDueDate(defaultDueDate());
    setWeekday("1");
    setFrequency("monthly");
    setCategory("");
    setCurrency("MXN");
    setNotes("");
    setNotifyDays("3");
    setNotifyHour("9");
    setKind("recurring");
    setShowTemplates(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const base = {
        name: name.trim(),
        amount: parseFloat(amount),
        currency,
        category: category.trim() || undefined,
        notes: notes.trim() || undefined,
        notify_days_before: parseInt(notifyDays, 10) || 3,
        notify_hour: parseInt(notifyHour, 10) || 9,
      };

      if (kind === "once") {
        await onSubmit({
          ...base,
          frequency: "once",
          due_date: dueDate,
        });
      } else if (frequency === "weekly") {
        await onSubmit({
          ...base,
          frequency: "weekly",
          due_day: parseInt(weekday, 10),
        });
      } else {
        await onSubmit({
          ...base,
          frequency,
          due_date: dueDate,
        });
      }
      reset();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn-primary btn-add btn-glow" onClick={() => setOpen(true)}>
        Registrar pago
      </button>
    );
  }

  const dateLabel =
    kind === "once"
      ? "Fecha de pago"
      : frequency === "yearly"
        ? "Fecha anual (mes y día)"
        : frequency === "weekly"
          ? "Próximo pago (fecha)"
          : "Próximo pago (día del mes)";

  return (
    <form className="form-card form-card-elevated" onSubmit={handleSubmit}>
      <div className="section-head">
        <h2>Registrar pago</h2>
        <p className="section-desc">Plantillas por tipo de egreso — tú pones el nombre y monto.</p>
      </div>

      {showTemplates && (
        <div className="entry-mode-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            className={`kind-btn ${entryMode === "templates" ? "active" : ""}`}
            onClick={() => setEntryMode("templates")}
          >
            Plantillas
          </button>
          <button
            type="button"
            role="tab"
            className={`kind-btn ${entryMode === "import" ? "active" : ""}`}
            onClick={() => setEntryMode("import")}
          >
            Importar
          </button>
        </div>
      )}

      {showTemplates && entryMode === "templates" && (
        <QuickTemplatePicker subscriptions={subscriptions} onSelect={applyTemplate} />
      )}

      {showTemplates && entryMode === "import" && (
        <ImportRemindersPanel
          onImport={async (rows) => {
            await onImportMany(rows);
            reset();
            setOpen(false);
          }}
        />
      )}

      {showTemplates ? null : (
        <button
          type="button"
          className="btn-text quick-templates-back"
          onClick={() => setShowTemplates(true)}
        >
          ← Plantillas o importar
        </button>
      )}

      {!showTemplates && (
        <>
      <div className="kind-toggle" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={kind === "recurring"}
          className={`kind-btn ${kind === "recurring" ? "active" : ""}`}
          onClick={() => setKind("recurring")}
        >
          Recurrente
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "once"}
          className={`kind-btn ${kind === "once" ? "active" : ""}`}
          onClick={() => setKind("once")}
        >
          Pago único
        </button>
      </div>

      <label>
        Nombre
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            kind === "once"
              ? "Seguro, colegiatura, crédito…"
              : "Nombre del servicio o préstamo"
          }
        />
      </label>

      <div className="form-row">
        <label>
          Monto
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </label>
        <label>
          Moneda
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
          </select>
        </label>
      </div>
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
          Hora evento
          <select value={notifyHour} onChange={(e) => setNotifyHour(e.target.value)}>
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={String(i)}>
                {String(i).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      </div>

      {kind === "recurring" && (
        <label>
          Frecuencia
          <select
            value={frequency}
            onChange={(e) => {
              const f = e.target.value as Frequency;
              setFrequency(f);
              if (f === "monthly") setDueDate(firstOfMonth());
            }}
          >
            {recurringFrequencies.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {kind === "recurring" && frequency !== "weekly" && (
        <label>
          {dateLabel}
          <input
            required
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
      )}

      {kind === "once" && (
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

      {kind === "recurring" && frequency === "weekly" && (
        <label>
          Día de la semana
          <select value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            {weekdays.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        Categoría (opcional)
        <input
          list="add-categories"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Casa, salud, auto…"
        />
        <datalist id="add-categories">
          {CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label>
        Notas (opcional)
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Referencia, número de póliza…"
        />
      </label>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
        </>
      )}
    </form>
  );
}
