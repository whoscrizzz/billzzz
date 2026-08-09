import { useMemo } from 'react';
import { ActionIcon } from './ActionIcon';
import { formatMoney } from '../lib/format-money';

interface Props {
  subscriptionName: string;
  amount: number;
  currency: string;
  paidAt: string;
  onClose: () => void;
}

function formatFolioDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** Confirmación tras pagar — mismo layout que el "Successful" del mockup,
 * con tono calmado en vez de celebratorio (ver bills-ux-copy.md): el usuario
 * está confirmando un pago, no ganando un premio. El folio es una referencia
 * generada localmente para mostrar, no un ID de servidor. */
export function PaymentSuccessSheet({
  subscriptionName,
  amount,
  currency,
  paidAt,
  onClose,
}: Props) {
  const folio = useMemo(
    () => `BLS-${Date.now().toString(36).toUpperCase()}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <dialog open className="modal payment-success-sheet">
      <div className="modal-card payment-success-card">
        <div className="payment-success-check" aria-hidden>
          <ActionIcon name="check" />
        </div>
        <h3 className="payment-success-title">Pago realizado</h3>
        <p className="payment-success-subtitle">{subscriptionName} fue pagado correctamente.</p>

        <dl className="payment-success-rows">
          <div className="payment-success-row">
            <dt>Monto</dt>
            <dd>{formatMoney(amount, currency)}</dd>
          </div>
          <div className="payment-success-row">
            <dt>Fecha</dt>
            <dd>{formatFolioDate(paidAt)}</dd>
          </div>
          <div className="payment-success-row">
            <dt>Folio</dt>
            <dd>#{folio}</dd>
          </div>
        </dl>

        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </dialog>
  );
}
