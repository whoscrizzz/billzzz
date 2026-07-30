import { useState } from 'react';
import { AuthStepIndicator } from './AuthStepIndicator';
import { ImportJsonPanel } from './ImportJsonPanel';
import { ImportRemindersPanel } from './ImportRemindersPanel';
import { loadNotifyDefault } from './PostLoginPushOffer';
import { QUICK_TEMPLATES, TEMPLATE_GROUPS, type QuickTemplate } from '../lib/quick-templates';
import { localIsoDate } from '../lib/local-date';
import { formatMoney } from '../lib/format-money';
import type { SubscriptionInput } from '../types/subscription';

const OFFER_KEY = 'bills-offer-onboarding';

export function markOnboardingOfferPending(): void {
  try {
    sessionStorage.setItem(OFFER_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function clearOnboardingOfferPending(): void {
  try {
    sessionStorage.removeItem(OFFER_KEY);
  } catch {
    /* private mode */
  }
}

export function shouldOfferOnboarding(): boolean {
  try {
    return sessionStorage.getItem(OFFER_KEY) === '1';
  } catch {
    return false;
  }
}

function buildInput(t: QuickTemplate, name: string, amount: number): SubscriptionInput {
  const notifyDefault = loadNotifyDefault();
  const input: SubscriptionInput = {
    name,
    amount,
    currency: t.currency,
    frequency: t.frequency,
    category: t.category,
    notify_days_before: notifyDefault?.days ?? t.notify_days_before,
    notify_hour: notifyDefault?.hour ?? t.notify_hour,
  };
  if (t.frequency === 'once') {
    const due = new Date();
    due.setDate(due.getDate() + 7);
    input.due_date = localIsoDate(due);
  } else if (t.frequency === 'weekly') {
    input.due_day = t.weekday ?? 5;
  } else {
    input.due_day = Math.min(new Date().getDate(), 28);
  }
  return input;
}

interface Row {
  name: string;
  amount: string;
}

interface Props {
  onCreateMany: (inputs: SubscriptionInput[]) => Promise<void>;
  onDismiss: () => void;
}

export function PostLoginOnboarding({ onCreateMany, onDismiss }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [creating, setCreating] = useState(false);
  const [importMode, setImportMode] = useState<'json' | 'reminders' | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const setRow = (id: string, patch: Partial<Row>) => {
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { name: '', amount: '' }), ...patch } }));
  };

  const selectedTemplates = selected
    .map((id) => QUICK_TEMPLATES.find((t) => t.id === id))
    .filter((t): t is QuickTemplate => t != null);

  const total = selectedTemplates.reduce((sum, t) => {
    const amount = parseFloat(rows[t.id]?.amount ?? '');
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);

  const readyToCreate =
    selectedTemplates.length > 0 &&
    selectedTemplates.every((t) => {
      const row = rows[t.id];
      const amount = parseFloat(row?.amount ?? '');
      return !!row?.name.trim() && Number.isFinite(amount) && amount > 0;
    });

  const handleCreate = async () => {
    if (!readyToCreate || creating) return;
    setCreating(true);
    try {
      const inputs = selectedTemplates.map((t) =>
        buildInput(t, rows[t.id].name.trim(), parseFloat(rows[t.id].amount))
      );
      await onCreateMany(inputs);
      clearOnboardingOfferPending();
      onDismiss();
    } finally {
      setCreating(false);
    }
  };

  const handleImportDone = async (inputs: SubscriptionInput[]) => {
    await onCreateMany(inputs);
    clearOnboardingOfferPending();
    onDismiss();
  };

  const handleSkip = () => {
    clearOnboardingOfferPending();
    onDismiss();
  };

  return (
    <div className="auth-shell">
      <div className="auth-card auth-card-login passkey-setup-card onboarding-card">
        <AuthStepIndicator step="onboarding" />
        <h1 className="auth-offer-title">Empecemos con 3</h1>
        <p className="auth-access-subtitle">
          Elige lo que ya pagas seguido — puedes editarlo o agregar más después.
        </p>

        {importMode == null && (
          <>
            <div className="onboarding-groups">
              {TEMPLATE_GROUPS.map((group) => (
                <div key={group.id} className="onboarding-group">
                  <p className="onboarding-group-label">{group.label}</p>
                  <div className="onboarding-chips">
                    {QUICK_TEMPLATES.filter((t) => t.group === group.id).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`onboarding-chip ${selected.includes(t.id) ? 'active' : ''}`}
                        onClick={() => toggle(t.id)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {selectedTemplates.length > 0 && (
              <div className="onboarding-rows">
                {selectedTemplates.map((t) => (
                  <div key={t.id} className="onboarding-row">
                    <input
                      type="text"
                      placeholder={t.namePlaceholder}
                      value={rows[t.id]?.name ?? ''}
                      onChange={(e) => setRow(t.id, { name: e.target.value })}
                    />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      placeholder={t.amountPlaceholder}
                      value={rows[t.id]?.amount ?? ''}
                      onChange={(e) => setRow(t.id, { amount: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="onboarding-summary">
              <span className="onboarding-summary-label">Elegidos</span>
              <span className="onboarding-summary-total">
                {selectedTemplates.length}
                <span className="onboarding-summary-sub">
                  {' '}
                  · {formatMoney(total, 'MXN')} / mes aprox.
                </span>
              </span>
            </div>

            <button
              type="button"
              className="btn-primary btn-add"
              disabled={!readyToCreate || creating}
              onClick={() => void handleCreate()}
            >
              {creating ? 'Creando...' : `Crear mis ${selectedTemplates.length || ''} pagos`}
            </button>

            <div className="onboarding-secondary-actions">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setImportMode('json')}
              >
                Importar JSON
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setImportMode('reminders')}
              >
                Pegar recordatorios
              </button>
            </div>
          </>
        )}

        {importMode === 'json' && <ImportJsonPanel onImport={handleImportDone} />}
        {importMode === 'reminders' && <ImportRemindersPanel onImport={handleImportDone} />}

        {importMode != null && (
          <button type="button" className="btn-text" onClick={() => setImportMode(null)}>
            ← Volver a plantillas
          </button>
        )}

        <button type="button" className="btn-text auth-link-muted" onClick={handleSkip}>
          Ahora no, ir a la app
        </button>
      </div>
    </div>
  );
}
