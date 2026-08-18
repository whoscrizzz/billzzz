import { useMemo, useRef, useState } from 'react';
import type { PaymentRecord, Subscription, SubscriptionInput } from '../types/subscription';
import { CATEGORIES, categoryColor } from '../lib/categories';
import type { QuickTemplate } from '../lib/quick-templates';
import { QUICK_TEMPLATES, TEMPLATE_GROUPS, templatesByGroup } from '../lib/quick-templates';
import { recordTemplateUse, suggestTemplates } from '../lib/template-suggestions';
import { addLocalDays, firstOfMonthLocal } from '../lib/local-date';
import { describeRecurrence } from '../lib/due-dates';
import { serializeDueDates, serializeDueDays } from '../lib/due-dates-json';
import { getTimezoneLabel, NOTIFY_TIMEZONE } from '../lib/notify-timezone';
import { addCustomCategory, loadCustomCategories } from '../lib/ui-prefs';
import { CompletedPaymentsPanel } from './CompletedPaymentsPanel';
import { CurrencyAmountInput } from './CurrencyAmountInput';
import { ImportJsonPanel } from './ImportJsonPanel';
import { ImportRemindersPanel } from './ImportRemindersPanel';
import { RecurrenceSheet, type RecurrenceDraft } from './RecurrenceSheet';

interface Props {
  onSubmit: (input: SubscriptionInput) => Promise<void>;
  onImportMany: (inputs: SubscriptionInput[]) => Promise<void>;
  subscriptions: Subscription[];
  payments: PaymentRecord[];
  archived: Subscription[];
  onRestoreArchived: (id: string) => void;
  onDeletePayment: (id: string) => Promise<void>;
  onClearHistory: () => Promise<void>;
  online: boolean;
  timezone?: string;
}

function defaultRecurrence(): RecurrenceDraft {
  const dueDate = addLocalDays(7);
  return {
    frequency: 'monthly',
    due_day: Number(dueDate.slice(8, 10)),
    due_date: dueDate,
    due_dates: [],
    due_days: [],
    interval_count: null,
    interval_unit: null,
  };
}

export function RegisterPanel({
  onSubmit,
  onImportMany,
  subscriptions,
  payments,
  archived,
  onRestoreArchived,
  onDeletePayment,
  onClearHistory,
  online,
  timezone = NOTIFY_TIMEZONE,
}: Props) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('MXN');
  const [recurrence, setRecurrence] = useState<RecurrenceDraft>(defaultRecurrence);
  const [showRecurrenceSheet, setShowRecurrenceSheet] = useState(false);
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [notifyDays, setNotifyDays] = useState('');
  const [notifyHour, setNotifyHour] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [saving, setSaving] = useState(false);
  // `saving` (state) no alcanza: en offline onSubmit resuelve casi instantáneo
  // (solo IndexedDB + cola de sync), así que la ventana de disabled={saving}
  // es demasiado corta para frenar un doble-tap real. El ref se lee/escribe
  // sin esperar a un re-render, así que sí bloquea el segundo submit a tiempo.
  const isSubmittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [tab, setTab] = useState<'nuevo' | 'historial'>('nuevo');
  const [customCategories, setCustomCategories] = useState<string[]>(() => loadCustomCategories());
  // "Otra…" abre el campo de texto libre dentro del mismo selector de chips
  // en vez de esconderlo detrás de "+ Nota" (donde categoría no pinta:
  // categoría no es una nota opcional, es el mismo campo que los chips).
  const [customCategoryOpen, setCustomCategoryOpen] = useState(false);

  const categoryChips = useMemo(
    () => [...CATEGORIES, ...customCategories.filter((c) => !CATEGORIES.includes(c as never))],
    [customCategories]
  );

  const suggested = suggestTemplates(subscriptions, 4);
  const historyCount = archived.length + payments.length;

  const recurrenceLabel = describeRecurrence({
    frequency: recurrence.frequency,
    due_day: recurrence.due_day,
    due_date: recurrence.due_date || null,
    due_dates: recurrence.due_dates.length > 0 ? serializeDueDates(recurrence.due_dates) : null,
    due_days: recurrence.due_days.length > 0 ? serializeDueDays(recurrence.due_days) : null,
    interval_count: recurrence.interval_count,
    interval_unit: recurrence.interval_unit,
    created_at: new Date().toISOString(),
    snoozed_until: null,
  });

  const preview = useMemo(() => {
    const items: string[] = [];
    if (name.trim()) items.push(name.trim());
    if (amount) items.push(`${amount} ${currency}`);
    items.push(recurrenceLabel);
    if (category.trim()) items.push(category.trim());
    if (notes.trim()) items.push('Notas');
    if (notifyDays || notifyHour) items.push('Recordatorio');
    return items;
  }, [name, amount, currency, recurrenceLabel, category, notes, notifyDays, notifyHour]);

  const applyTemplate = (t: QuickTemplate) => {
    recordTemplateUse(t.id);
    setActiveTemplateId(t.id);
    setCategory(t.category);
    setCurrency(t.currency);
    setNotifyDays(String(t.notify_days_before));
    setNotifyHour(String(t.notify_hour));
    setShowOptional(true);
    const dueDate =
      t.frequency === 'monthly'
        ? firstOfMonthLocal()
        : addLocalDays(t.frequency === 'yearly' ? 30 : 7);
    setRecurrence({
      frequency: t.frequency,
      due_day: t.weekday ?? Number(dueDate.slice(8, 10)),
      due_date: dueDate,
      due_dates: [],
      due_days: [],
      interval_count: null,
      interval_unit: null,
    });
  };

  const resetForm = () => {
    setName('');
    setAmount('');
    setRecurrence(defaultRecurrence());
    setCategory('');
    setCustomCategoryOpen(false);
    setCurrency('MXN');
    setNotes('');
    setNotifyDays('');
    setNotifyHour('');
    setShowOptional(false);
    setActiveTemplateId(null);
  };

  const buildInput = (): SubscriptionInput | null => {
    if (!name.trim() || !amount) return null;

    const input: SubscriptionInput = {
      name: name.trim(),
      amount: parseFloat(amount),
      currency,
      frequency: recurrence.frequency,
      due_date: recurrence.due_date || undefined,
      due_day: recurrence.due_day,
      due_dates: recurrence.due_dates,
      due_days: recurrence.due_days,
      interval_count: recurrence.interval_count,
      interval_unit: recurrence.interval_unit,
    };

    // La categoría NO se condiciona a `showOptional`: ahora vive en los chips
    // visibles, y además las plantillas la rellenan solas (`applyTemplate`), así
    // que gatearla en el submit la descartaba en silencio si el usuario no
    // abría la sección opcional.
    if (category.trim()) input.category = category.trim();
    if (showOptional && notes.trim()) input.notes = notes.trim();
    if (showOptional && notifyDays.trim()) {
      input.notify_days_before = parseInt(notifyDays, 10) || 1;
    }
    if (showOptional && notifyHour.trim()) {
      input.notify_hour = parseInt(notifyHour, 10) || 9;
    }

    return input;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      // buildInput() devolvía null en silencio si faltaba el monto — el botón
      // Guardar no hacía nada visible. Ahora se valida antes y se avisa.
      if (!name.trim()) {
        setSubmitError('Ingresa un nombre.');
        return;
      }
      const parsedAmount = parseFloat(amount);
      if (!amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        setSubmitError('Ingresa un monto válido.');
        return;
      }
      const input = buildInput();
      if (!input) return;
      setSaving(true);
      setSubmitError(null);
      try {
        await onSubmit(input);
        if (input.category && !CATEGORIES.includes(input.category as never)) {
          setCustomCategories(addCustomCategory(input.category));
        }
        resetForm();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'No se pudo guardar el pago');
      } finally {
        setSaving(false);
      }
    } finally {
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="register-panel">
      <header className="register-panel-head">
        <h2>+Nuevo</h2>
        <div className="layout-toggle" role="tablist" aria-label="Vista de registrar">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'nuevo'}
            className={`layout-toggle-btn ${tab === 'nuevo' ? 'active' : ''}`}
            onClick={() => setTab('nuevo')}
          >
            Nuevo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'historial'}
            className={`layout-toggle-btn ${tab === 'historial' ? 'active' : ''}`}
            onClick={() => setTab('historial')}
          >
            Historial{historyCount > 0 ? ` (${historyCount})` : ''}
          </button>
        </div>
      </header>

      {tab === 'nuevo' && (
        <div className="register-panel-unified panel-card">
          <form className="register-form" onSubmit={handleSubmit}>
            <div className="register-panel-body">
              <div className="register-field-group">
                <p className="composer-templates-label">Qué es</p>
                <label>
                  <span className="field-label-text">
                    Nombre <span className="field-required">*</span>
                  </span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      activeTemplateId
                        ? (QUICK_TEMPLATES.find((t) => t.id === activeTemplateId)
                            ?.namePlaceholder ?? 'Nombre del pago')
                        : 'Nuevo registro? Anotalo...'
                    }
                  />
                </label>

                <div className="register-amount-row">
                  <CurrencyAmountInput
                    amount={amount}
                    currency={currency}
                    onAmountChange={setAmount}
                    onCurrencyChange={setCurrency}
                  />
                </div>
              </div>

              <div className="register-field-group">
                <p className="composer-templates-label">Cuándo</p>
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
              </div>

              <div className="register-cat-field">
                <p className="register-cat-label">Tus Categorías</p>
                <div className="register-cat-chips" role="group" aria-label="Tus Categorías">
                  {categoryChips.map((c) => {
                    const selected = category === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        className={`register-cat-chip ${selected ? 'active' : ''}`}
                        aria-pressed={selected}
                        onClick={() => {
                          setCustomCategoryOpen(false);
                          setCategory(selected ? '' : c);
                        }}
                      >
                        <span
                          className="register-cat-chip-dot"
                          style={{ background: categoryColor(c) }}
                          aria-hidden
                        />
                        {c}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={`register-cat-chip ${customCategoryOpen ? 'active' : ''}`}
                    aria-pressed={customCategoryOpen}
                    onClick={() => setCustomCategoryOpen((v) => !v)}
                  >
                    Otra…
                  </button>
                </div>
                {(customCategoryOpen ||
                  (category.trim() !== '' && !categoryChips.includes(category))) && (
                  <input
                    autoFocus
                    className="register-cat-custom-input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Escribe una categoría"
                  />
                )}
              </div>

              <button
                type="button"
                className="btn-text register-optional-toggle"
                onClick={() => setShowOptional((v) => !v)}
                aria-expanded={showOptional}
              >
                {showOptional ? 'Menos opciones' : '+ Nota'}
              </button>

              {showOptional && (
                <div className="register-optional">
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
                      Hora ({getTimezoneLabel(timezone)})
                      <select value={notifyHour} onChange={(e) => setNotifyHour(e.target.value)}>
                        <option value="">Por defecto</option>
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={String(i)}>
                            {String(i).padStart(2, '0')}:00
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

              {submitError && <p className="banner error">{submitError}</p>}

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
            </div>

            <div className="form-actions register-panel-footer">
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Limpiar
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar pago'}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'historial' && (
        <div className="register-panel-unified panel-card">
          <CompletedPaymentsPanel
            payments={payments}
            archived={archived}
            onRestoreArchived={onRestoreArchived}
            onDeletePayment={onDeletePayment}
            onClearHistory={onClearHistory}
            online={online}
          />
        </div>
      )}
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
      className={`composer-template-btn ${active ? 'active' : ''}`}
      title={template.hint}
      onClick={() => onSelect(template)}
    >
      <span className="composer-template-label">{template.label}</span>
    </button>
  );
}
