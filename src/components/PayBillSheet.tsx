import { useMemo, useState } from 'react';
import { ActionIcon } from './ActionIcon';
import { useCalculator } from '../contexts/CalculatorContext';
import { currentDueAmount } from '../lib/due-dates-json';
import { formatMoney } from '../lib/format-money';
import { localIsoDate } from '../lib/local-date';
import type { Subscription } from '../types/subscription';

interface Props {
  subscriptions: Subscription[];
  /** Preselecciona un proveedor (ej. al entrar desde la tarjeta de una suscripción). */
  initialSubscriptionId?: string | null;
  onConfirm: (subscription: Subscription, amount: number, paidAt: string) => void;
  onClose: () => void;
}

/** Pantalla "Pagar factura" — mismo layout que el Review del mockup de
 * referencia (origen, destino, monto grande, atajos, CTA), pero conectada a
 * datos reales: "Desde" es tu cuenta en Bills (informativa, no hay banco
 * conectado), "Para" es una de tus facturas pendientes, y confirmar dispara
 * el markPaid real. El teclado numérico reutiliza la calculadora flotante ya
 * existente en la app en vez de duplicar un keypad nuevo. */
export function PayBillSheet({ subscriptions, initialSubscriptionId, onConfirm, onClose }: Props) {
  const { openCalculator } = useCalculator();
  const payable = useMemo(() => subscriptions.filter((s) => !s.deleted_at), [subscriptions]);

  const [subId, setSubId] = useState<string>(initialSubscriptionId ?? payable[0]?.id ?? '');
  const selected = payable.find((s) => s.id === subId) ?? null;
  const [amount, setAmount] = useState<string>(selected ? String(currentDueAmount(selected)) : '');
  const [paidAt, setPaidAt] = useState(localIsoDate());

  const handleSelect = (id: string) => {
    setSubId(id);
    const sub = payable.find((s) => s.id === id);
    if (sub) setAmount(String(currentDueAmount(sub)));
  };

  const submit = () => {
    const value = parseFloat(amount);
    if (!selected || !Number.isFinite(value) || value <= 0) return;
    onConfirm(selected, value, paidAt);
  };

  return (
    <dialog open className="modal pay-bill-sheet">
      <div className="modal-card pay-bill-card">
        <div className="pay-bill-head">
          <button type="button" className="btn-icon-sm" onClick={onClose} aria-label="Cerrar">
            <ActionIcon name="chevron-left" />
          </button>
          <h3>Pagar factura</h3>
          <span aria-hidden style={{ width: 32 }} />
        </div>

        <label className="pay-bill-field">
          <span className="pay-bill-field-label">Desde</span>
          <span className="pay-bill-field-value">Cuenta principal en Bills</span>
        </label>

        <label className="pay-bill-field">
          <span className="pay-bill-field-label">Para</span>
          <select
            className="pay-bill-select"
            value={subId}
            onChange={(e) => handleSelect(e.target.value)}
          >
            {payable.length === 0 && <option value="">Sin facturas registradas</option>}
            {payable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="pay-bill-amount-wrap">
          <input
            className="pay-bill-amount-input"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Monto a pagar"
          />
          <button
            type="button"
            className="btn-icon-sm"
            aria-label="Abrir calculadora"
            title="Calculadora"
            onClick={() =>
              openCalculator({
                initialValue: parseFloat(amount) || undefined,
                onUseAsAmount: (value) => setAmount(String(value)),
              })
            }
          >
            <ActionIcon name="calculator" />
          </button>
        </div>
        {selected && (
          <p className="pay-bill-hint">
            Monto sugerido: {formatMoney(currentDueAmount(selected), selected.currency)}
          </p>
        )}

        <label className="pay-bill-field">
          <span className="pay-bill-field-label">Fecha</span>
          <input
            type="date"
            className="pay-bill-date-input"
            value={paidAt}
            max={localIsoDate()}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </label>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={submit}
            disabled={!selected || !amount}
          >
            Confirmar pago
          </button>
        </div>
      </div>
    </dialog>
  );
}
