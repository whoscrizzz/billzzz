import { useEffect, useRef, useState } from 'react';
import type { Subscription } from '../types/subscription';
import type { QuickTemplate } from '../lib/quick-templates';
import { suggestTemplates, recordTemplateUse } from '../lib/template-suggestions';
import { buildLooseExpenseFromQuickAdd, buildSubscriptionFromQuickAdd } from '../lib/quick-add';
import { QuickTemplatePicker } from './QuickTemplatePicker';
import { CurrencyAmountInput } from './CurrencyAmountInput';

interface Props {
  subscriptions: Subscription[];
  open: boolean;
  onClose: () => void;
  onSubmit: (input: import('../types/subscription').SubscriptionInput) => Promise<void>;
  /** Plantillas 'once' (gasto ya pagado, sin bill) van por acá en vez de onSubmit. */
  onSubmitExpense: (input: import('../types/subscription').LooseExpenseInput) => Promise<void>;
  /** Fase 7b: valores que vienen de un texto compartido (share_target). Solo
   *  se aplican al abrir la hoja; a partir de ahí el usuario manda. */
  prefill?: { name?: string; amount?: number } | null;
}

export function QuickAddSheet({
  subscriptions,
  open,
  onClose,
  onSubmit,
  onSubmitExpense,
  prefill,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [template, setTemplate] = useState<QuickTemplate | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const openedOnce = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      openedOnce.current = false;
      return;
    }
    if (openedOnce.current) return;
    openedOnce.current = true;
    const first = suggestTemplates(subscriptions, 1)[0];
    if (first) setTemplate(first);
    // El prefill del share_target pisa los campos vacíos al abrir, no después
    // — si el usuario ya empezó a escribir, openedOnce lo protege.
    if (prefill?.name) setName(prefill.name);
    if (prefill?.amount != null) setAmount(String(prefill.amount));
  }, [open, subscriptions, prefill]);

  const reset = () => {
    setTemplate(null);
    setName('');
    setAmount('');
    setSaveError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickTemplate = (t: QuickTemplate) => {
    recordTemplateUse(t.id);
    setTemplate(t);
    setName('');
    setAmount('');
  };

  const activeTemplate = template;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTemplate || !name.trim() || !amount) return;
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (activeTemplate.kind === 'once') {
        await onSubmitExpense(buildLooseExpenseFromQuickAdd(activeTemplate, name, parsed));
      } else {
        await onSubmit(buildSubscriptionFromQuickAdd(activeTemplate, name, parsed));
      }
      handleClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'No se pudo guardar el pago');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="modal quick-add-sheet" onClose={handleClose}>
      <form className="modal-card" onSubmit={handleSave}>
        <h3>Registro rápido</h3>
        <p className="panel-hint">Elige tipo, nombre y monto — el resto viene del patrón.</p>

        {!template && <QuickTemplatePicker subscriptions={subscriptions} onSelect={pickTemplate} />}

        {activeTemplate && (
          <>
            <p className="quick-add-active-template">
              Tipo: <strong>{activeTemplate.label}</strong>
              {template && (
                <button
                  type="button"
                  className="btn-link btn-text-sm"
                  onClick={() => setTemplate(null)}
                >
                  Cambiar
                </button>
              )}
            </p>
            <label>
              Nombre
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={activeTemplate.namePlaceholder}
                autoFocus
                required
              />
            </label>
            <CurrencyAmountInput
              amount={amount}
              currency={activeTemplate.currency}
              onAmountChange={setAmount}
              onCurrencyChange={() => {}}
            />
            {saveError && <p className="banner error">{saveError}</p>}
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={handleClose}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving || !name.trim() || !amount}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        )}

        {!activeTemplate && (
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={handleClose}>
              Cerrar
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}
