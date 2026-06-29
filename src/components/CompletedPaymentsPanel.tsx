import { useMemo, useState } from 'react';
import type { PaymentRecord, Subscription } from '../types/subscription';

interface Props {
  payments: PaymentRecord[];
  archived: Subscription[];
  onRestoreArchived: (id: string) => void;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function CompletedPaymentsPanel({ payments, archived, onRestoreArchived }: Props) {
  const [open, setOpen] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const archivedIds = useMemo(() => new Set(archived.map((s) => s.id)), [archived]);
  const totalCount = archived.length + payments.length;

  if (totalCount === 0) {
    return (
      <section className="register-completed register-completed-empty">
        <h3 className="register-completed-title">Pagos terminados</h3>
        <p className="panel-hint">
          Cuando marques un pago único como pagado, aparecerá aquí con historial. Puedes restaurarlo
          si te equivocaste.
        </p>
      </section>
    );
  }

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      onRestoreArchived(id);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <section className="register-completed">
      <button
        type="button"
        className="register-completed-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <h3 className="register-completed-title">Pagos terminados e historial</h3>
        <span className="register-completed-meta">
          {archived.length > 0 && `${archived.length} archivado(s)`}
          {archived.length > 0 && payments.length > 0 && ' · '}
          {payments.length > 0 && `${payments.length} registro(s)`}
        </span>
        <span className="payment-history-chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="register-completed-body">
          {archived.length > 0 && (
            <div className="register-completed-block">
              <p className="register-completed-label">Archivados — puedes restaurar</p>
              <ul className="completed-list">
                {archived.map((sub) => (
                  <li key={sub.id} className="completed-row">
                    <div className="completed-row-main">
                      <p className="completed-name">{sub.name}</p>
                      <p className="completed-meta">
                        {formatMoney(sub.amount, sub.currency)}
                        {sub.due_date && ` · vencía ${formatDate(sub.due_date)}`}
                        {sub.deleted_at && ` · terminado ${formatDate(sub.deleted_at)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={restoringId === sub.id}
                      onClick={() => void handleRestore(sub.id)}
                    >
                      {restoringId === sub.id ? 'Restaurando…' : 'Restaurar'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {payments.length > 0 && (
            <div className="register-completed-block">
              <p className="register-completed-label">Historial de pagos registrados</p>
              <ul className="completed-list completed-list-history">
                {payments.map((p) => (
                  <li key={p.id} className="completed-row completed-row-history">
                    <div className="completed-row-main">
                      <p className="completed-name">{p.subscription_name ?? 'Pago'}</p>
                      <p className="completed-meta">
                        {formatDate(p.paid_at)}
                        {p.notes && ` · ${p.notes}`}
                        {archivedIds.has(p.subscription_id) && ' · archivado'}
                      </p>
                    </div>
                    <p className="completed-amount">{formatMoney(p.amount, p.currency)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
