import { useMemo, useState } from "react";
import type { Frequency, PaymentRecord, Subscription, SubscriptionInput } from "../types/subscription";
import { CATEGORIES } from "../lib/categories";
import type { QuickTemplate } from "../lib/quick-templates";
import { QUICK_TEMPLATES, TEMPLATE_GROUPS, templatesByGroup } from "../lib/quick-templates";
import { recordTemplateUse, suggestTemplates } from "../lib/template-suggestions";
import { addLocalDays, firstOfMonthLocal } from "../lib/local-date";
import { FREQUENCY_LABELS } from "../lib/due-dates";
import { CompletedPaymentsPanel } from "./CompletedPaymentsPanel";
import { CurrencyAmountInput } from "./CurrencyAmountInput";
import { ImportJsonPanel } from "./ImportJsonPanel";
import { ImportRemindersPanel } from "./ImportRemindersPanel";
import { MultiDateChips } from "./MultiDateChips";
import { WeekdayPills } from "./WeekdayPills";

interface Props {
  onSubmit: (input: SubscriptionInput) => Promise<void>;
  onImportMany: (inputs: SubscriptionInput[]) => Promise<void>;
  subscriptions: Subscription[];
  payments: PaymentRecord[];
  archived: Subscription[];
  onRestoreArchived: (id: string) => void;
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

function pruneInput(input: SubscriptionInput): SubscriptionInput {
  const out: SubscriptionInput = {
    name: input.name,
    amount: input.amount,
    frequency: input.frequency,
    currency: input.currency ?? "MXN",
  };
  if (input.due_day != null) out.due_day = input.due_day;
  if (input.due_date) out.due_date = input.due_date;
  if (input.due_dates?.length) out.due_dates = input.due_dates;
  if (input.category?.trim()) out.category = input.category.trim();
  if (input.notes?.trim()) out.notes = input.notes.trim();
  if (input.notify_days_before != null) out.notify_days_before = input.notify_days_before;
  if (input.notify_hour != null) out.notify_hour = input.notify_hour;
  return out;
}

export function RegisterPanel({
  onSubmit,
  onImportMany,
  subscriptions,
  payments,
  archived,
  onRestoreArchived,
}: Props) {
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
  const [notifyDays, setNotifyDays] = useState("");
  const [notifyHour, setNotifyHour] = useState("");
  const [showOptional, setShowOptional] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const suggested = suggestTemplates(subscriptions, 4);

  const preview = useMemo(() => {
    const items: string[] = [];
    if (name.trim()) items.push(name.trim());
    if (amount) items.push(`${amount} ${currency}`);
    if (kind === "once") items.push("Pago único");
    else items.push(FREQUENCY_LABELS[frequency]);
    if (multiDateMode && extraDates.length > 0) {
      items.push(`${extraDates.length} fecha(s)`);
    } else if (kind === "recurring" && frequency === "weekly") {
      items.push(`Semanal`);
    } else if (dueDate) {
      items.push(dueDate);
    }
    if (category.trim()) items.push(category.trim());
    if (notes.trim()) items.push("Notas");
    if (notifyDays || notifyHour) items.push("Recordatorio");
    return items;
  }, [
    name,
    amount,
    currency,
    kind,
    frequency,
    multiDateMode,
    extraDates.length,
    dueDate,
    category,
    notes,
    notifyDays,
    notifyHour,
  ]);

  const applyTemplate = (t: QuickTemplate) => {
    recordTemplateUse(t.id);
    setActiveTemplateId(t.id);
    setKind(t.kind);
    setFrequency(t.frequency);
    setCategory(t.category);
    setCurrency(t.currency);
    setNotifyDays(String(t.notify_days_before));
    setNotifyHour(String(t.notify_hour));
    setShowOptional(true);
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
    setNotifyDays("");
    setNotifyHour("");
    setKind("recurring");
    setShowOptional(false);
    setActiveTemplateId(null);
  };

  const buildInput = (): SubscriptionInput | null => {
    if (!name.trim() || !amount) return null;
    if (multiDateMode && extraDates.length === 0) return null;

    let input: SubscriptionInput = {
      name: name.trim(),
      amount: parseFloat(amount),
      currency,
      frequency: kind === "once" ? "once" : frequency,
    };

    if (showOptional && category.trim()) input.category = category.trim();
    if (showOptional && notes.trim()) input.notes = notes.trim();
    if (showOptional && notifyDays.trim()) {
      input.notify_days_before = parseInt(notifyDays, 10) || 1;
    }
    if (showOptional && notifyHour.trim()) {
      input.notify_hour = parseInt(notifyHour, 10) || 9;
    }

    if (multiDateMode && extraDates.length > 0) {
      return pruneInput({
        ...input,
        due_dates: extraDates,
        due_date: extraDates[0],
      });
    }

    if (kind === "once") {
      return pruneInput({ ...input, due_date: dueDate });
    }
    if (frequency === "weekly") {
      return pruneInput({ ...input, due_day: parseInt(weekday, 10) });
    }
    return pruneInput({ ...input, due_date: dueDate });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = buildInput();
    if (!input) return;
    setSaving(true);
    try {
      await onSubmit(input);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="register-panel">
      <header className="register-panel-head">
        <h2>Registrar pago</h2>
      </header>

      <div className="register-panel-unified panel-card">
        <form className="register-form" onSubmit={handleSubmit}>
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
            Nombre <span className="field-required">*</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                activeTemplateId
                  ? (QUICK_TEMPLATES.find((t) => t.id === activeTemplateId)?.namePlaceholder ??
                    "Nombre del pago")
                  : "Netflix, Cloudflare, renta…"
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
            Varias fechas
          </label>

          {multiDateMode ? (
            <MultiDateChips dates={extraDates} onChange={setExtraDates} />
          ) : kind === "recurring" && frequency === "weekly" ? (
            <label>
              Día de la semana
              <WeekdayPills value={weekday} onChange={setWeekday} />
            </label>
          ) : (
            <div className="date-presets">
              <span className="field-label">
                {kind === "once" ? "Fecha de pago" : "Próximo vencimiento"}{" "}
                <span className="field-required">*</span>
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

          <button
            type="button"
            className="btn-text register-optional-toggle"
            onClick={() => setShowOptional((v) => !v)}
            aria-expanded={showOptional}
          >
            {showOptional ? "Menos opciones" : "+ Categoría y recordatorio"}
          </button>

          {showOptional && (
            <div className="register-optional">
              <label>
                Categoría
                <input
                  list="register-categories"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Opcional"
                />
                <datalist id="register-categories">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label>
                Notas
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Opcional — referencia, folio…"
                />
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
                    placeholder="1"
                  />
                </label>
                <label>
                  Hora
                  <select
                    value={notifyHour}
                    onChange={(e) => setNotifyHour(e.target.value)}
                  >
                    <option value="">Por defecto</option>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={String(i)}>
                        {String(i).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {preview.length > 0 && (
            <div className="register-preview" aria-live="polite">
              <span className="register-preview-label">Vista previa</span>
              <div className="register-preview-chips">
                {preview.map((item) => (
                  <span key={item} className="meta-chip">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={resetForm}>
              Limpiar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || (multiDateMode && extraDates.length === 0)}
            >
              {saving ? "Guardando…" : "Guardar pago"}
            </button>
          </div>
        </form>

        <div className="register-panel-divider" aria-hidden />

        <details className="register-section">
          <summary>Plantillas</summary>
          <div className="composer-panel">
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
          </div>
        </details>

        <details className="register-section">
          <summary>Importar</summary>
          <div className="register-import-block">
            <ImportRemindersPanel onImport={onImportMany} />
            <ImportJsonPanel onImport={onImportMany} />
          </div>
        </details>

        <div className="register-panel-divider" aria-hidden />

        <CompletedPaymentsPanel
          payments={payments}
          archived={archived}
          onRestoreArchived={onRestoreArchived}
        />
      </div>
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
    </button>
  );
}
