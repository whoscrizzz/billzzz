import { useEffect, useRef } from 'react';
import type { Subscription } from '../types/subscription';

export type ConfirmAction =
  | { type: 'delete'; subscription: Subscription }
  | { type: 'mark-all'; subscriptions: Subscription[] };

interface Props {
  action: ConfirmAction;
  onConfirm: () => void;
  onClose: () => void;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
}

function actionCopy(action: ConfirmAction): {
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
} {
  switch (action.type) {
    case 'delete':
      return {
        title: 'Eliminar pago',
        body: `¿Eliminar ${action.subscription.name}? Podrás deshacerlo desde el aviso inferior.`,
        confirmLabel: 'Eliminar',
        danger: true,
      };
    case 'mark-all': {
      const n = action.subscriptions.length;
      return {
        title: 'Marcar todos',
        body: `¿Marcar ${n} pago${n !== 1 ? 's' : ''} como pagado${n !== 1 ? 's' : ''} hoy?`,
        confirmLabel: `Marcar ${n}`,
        danger: false,
      };
    }
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function ConfirmActionModal({ action, onConfirm, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const copy = actionCopy(action);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-card confirm-modal">
        <h3>{copy.title}</h3>
        <p className="confirm-modal-body">{copy.body}</p>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={copy.danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
