import { useState } from "react";
import type { Frequency, Subscription, SubscriptionInput } from "../types/subscription";
import { CATEGORIES } from "../lib/categories";
import type { QuickTemplate } from "../lib/quick-templates";
import { QUICK_TEMPLATES, TEMPLATE_GROUPS, templatesByGroup } from "../lib/quick-templates";
import { recordTemplateUse, suggestTemplates } from "../lib/template-suggestions";
import { addLocalDays, firstOfMonthLocal } from "../lib/local-date";
import { CurrencyAmountInput } from "./CurrencyAmountInput";
import { ImportRemindersPanel } from "./ImportRemindersPanel";
import { MultiDateChips } from "./MultiDateChips";
import { WeekdayPills } from "./WeekdayPills";

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

type BillKind = "recurring" | "once";

const DATE_PRESETS = [
  { label: "Hoy", days: 0 },
  { label: "Mañana", days: 1 },
  { label: "7 días", days: 7 },
] as const;

export function BillComposer({
  onSubmit,
  onImportMany,
  subscriptions,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [kind, setKind] = useState<BillKind>("recurring");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [dueDate, setDueDate] = useState(() => addLocalDays(7));
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [multiDateMode, setMultiDateMode] = useState(false);
  const [weekday, setWeekday] = useState("1");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [notifyDays, setNotifyDays] = useState("1");
  const [notifyHour, setNotifyHour] = useState("9");
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const suggested = suggestTemplates(subscriptions, 4);

  const applyTemplate = (t: QuickTemplate) => {
    recordTemplateUse(t.id);
    setActiveTemplateId(t.id);
    setKind(t.kind);
    setFrequency(t.frequency);
    setCategory(t.category);
    setCurrency(t.currency);
    setNotifyDays(String(t.notify_days_before));
    setNotifyHour(String(t.notify_hour));
    setMultiDateMode(false);
    setExtraDates([]);
    if (t.weekday) setWeekday(String(t.weekday));
    if (t.frequency === "monthly") setDueDate(firstOfMonthLocal());
    else setDueDate(addLocalDays(t.frequency === "yearly" ? 30 : 7));
  };

  const resetForm = () => {
    setName("");
    setAmount("");
    setDueDate(addLocalDays(7));
    setExtraDates([]);
    setMultiDateMode(false);
    setWeekday("1");
    setFrequency("monthly");
    setCategory("");
    setCurrency("MXN");
    setNotes("");
    setNotifyDays("1");
    setNotifyHour("9");
    setKind("recurring");
    setActiveTemplateId(null);
  };

  const buildInput = (): SubscriptionInput | null => {
    if (!name.trim() || !amount) return null;
    if (multiDateMode && extraDates.length === 0) return null;
    const base = {
      name: name.trim(),
      amount: parseFloat(amount),
      currency,
      category: category.trim() || undefined,
      notes: notes.trim() || undefined,
      notify_days_before: parseInt(notifyDays, 10) || 1,
      notify_hour: parseInt(notifyHour, 10) || 9,
    };

    if (multiDateMode && extraDates.length > 0) {
      return {
        ...base,
        frequency: kind === "once" ? "once" : frequency,
        due_dates: extraDates,
        due_date: extraDates[0],
      };
    }

    if (kind === "once") {
      return { ...base, frequency: "once", due_date: dueDate };
    }
    if (frequency === "weekly") {
      return { ...base, frequency: "weekly", due_day: parseInt(weekday, 10) };
    }
    return { ...base, frequency, due_date: dueDate };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = buildInput();
    if (!input) return;
    setSaving(true);
    try {
      await onSubmit(input);
      resetForm();
      if (!defaultOpen) setOpen(false);
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

  return (
    <div className="bill-composer">
      <div className="section-head">
        <h2>Registrar pago</h2>
        <p className="section-desc">Panel único — plantilla, monto, fechas y listo.</p>
      </div>

      <details className="composer-templates-collapse" open={defaultOpen}>
        <summary>Plantillas rápidas</summary>
        <section className="composer-panel" aria-label="Plantillas rápidas">
          {suggested.length > 0 && (
            <div className="composer-templates-block">
              <p className="composer-templates-label">Sugeridos</p>
              <div className="composer-template-grid">
                {suggested.map((t) => (
                  <TemplateBtn
                    key={t.id}
                    template={t}
                    active={activeTemplateId === t.id}
                    onSelect={applyTemplate}
                  />
                ))}
              </div>
            </div>
          )}
          {TEMPLATE_GROUPS.map((g) => (
            <div key={g.id} className="composer-templates-block">
              <p className="composer-templates-label">{g.label}</p>
              <div className="composer-template-grid">
                {templatesByGroup(g.id).map((t) => (
                  <TemplateBtn
                    key={t.id}
                    template={t}
                    active={activeTemplateId === t.id}
                    onSelect={applyTemplate}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      </details>

      <form className="composer-form form-card form-card-elevated" onSubmit={handleSubmit}>
        <div className="kind-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            className={`kind-btn ${kind === "recurring" ? "active" : ""}`}
            onClick={() => setKind("recurring")}
          >
            Recurrente
          </button>
          <button
            type="button"
            role="tab"
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
              activeTemplateId
                ? (QUICK_TEMPLATES.find((t) => t.id === activeTemplateId)?.namePlaceholder ??
                  "Nombre del pago")
                : "Netflix, renta, colegiatura…"
            }
          />
        </label>

        <CurrencyAmountInput
          amount={amount}
          currency={currency}
          onAmountChange={setAmount}
          onCurrencyChange={setCurrency}
        />

        {kind === "recurring" && (
          <label>
            Frecuencia
            <select
              value={frequency}
              onChange={(e) => {
                const f = e.target.value as Frequency;
                setFrequency(f);
                if (f === "monthly") setDueDate(firstOfMonthLocal());
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
          Varias fechas en este mismo pago
        </label>

        {multiDateMode ? (
          <MultiDateChips dates={extraDates} onChange={setExtraDates} />
        ) : (
          <>
            {kind === "recurring" && frequency === "weekly" ? (
              <label>
                Día de la semana
                <WeekdayPills value={weekday} onChange={setWeekday} />
              </label>
            ) : (
              <div className="date-presets">
                <span className="field-label">
                  {kind === "once" ? "Fecha de pago" : "Próximo vencimiento"}
                </span>
                <div className="date-preset-row">
                  {DATE_PRESETS.map((p) => (
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
                <input
                  required
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        <label>
          Categoría
          <input
            list="composer-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Suscripciones, casa, educación…"
          />
          <datalist id="composer-categories">
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
            Hora
            <select value={notifyHour} onChange={(e) => setNotifyHour(e.target.value)}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={String(i)}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Notas (opcional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Referencia, folio…" />
        </label>

        <div className="form-actions">
          {!defaultOpen && (
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={saving || (multiDateMode && extraDates.length === 0)}>
            {saving ? "Guardando…" : "Guardar pago"}
          </button>
        </div>
      </form>

      <details className="composer-import" open={showImport} onToggle={(e) => setShowImport(e.currentTarget.open)}>
        <summary>Importar desde Recordatorios / CSV</summary>
        <ImportRemindersPanel
          onImport={async (rows) => {
            await onImportMany(rows);
            resetForm();
            if (!defaultOpen) setOpen(false);
          }}
        />
      </details>
    </div>
  );
}

function TemplateBtn({
  template,
  active,
  onSelect,
}: {
  template: QuickTemplate;
  active: boolean;
  onSelect: (t: QuickTemplate) => void;
}) {
  return (
    <button
      type="button"
      className={`composer-template-btn ${active ? "active" : ""}`}
      title={template.hint}
      onClick={() => onSelect(template)}
    >
      <span className="composer-template-label">{template.label}</span>
      <span className="composer-template-hint">{template.hint}</span>
    </button>
  );
}
