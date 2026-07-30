import { useEffect, useMemo, useRef, useState } from 'react';
import type { PaymentRecord, Subscription } from '../types/subscription';
import { formatMoney } from '../lib/format-money';

interface Props {
  payments: PaymentRecord[];
  archived: Subscription[];
  onRestoreArchived: (id: string) => void;
  onDeletePayment: (id: string) => Promise<void>;
  onClearHistory: () => Promise<void>;
  online: boolean;
}

type ConfirmMode = 'selected' | 'all' | null;

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function CompletedPaymentsPanel({
  payments,
  archived,
  onRestoreArchived,
  onDeletePayment,
  onClearHistory,
  online,
}: Props) {
  const [open, setOpen] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const archivedIds = useMemo(() => new Set(archived.map((s) => s.id)), [archived]);
  const totalCount = archived.length + payments.length;

  useEffect(() => {
    // Cualquier registro que ya no exista en `payments` (borrado en otra
    // pestaña/dispositivo) no debe quedarse marcado como seleccionado.
    setSelectedIds((prev) => {
      const validIds = new Set(payments.map((p) => p.id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [payments]);

  useEffect(() => {
    if (confirmMode) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [confirmMode]);

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

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === payments.length ? new Set() : new Set(payments.map((p) => p.id))
    );
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      if (confirmMode === 'all') {
        await onClearHistory();
        setSelectedIds(new Set());
      } else if (confirmMode === 'selected') {
        for (const id of selectedIds) {
          await onDeletePayment(id);
        }
        setSelectedIds(new Set());
      }
    } finally {
      setBusy(false);
      setConfirmMode(null);
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
              <div className="register-completed-history-head">
                <label className="checkbox-label completed-select-all">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === payments.length}
                    disabled={!online}
                    onChange={toggleSelectAll}
                  />
                  Historial de pagos registrados
                </label>
                <div className="register-completed-history-actions">
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={!online}
                      onClick={() => setConfirmMode('selected')}
                    >
                      Eliminar seleccionados ({selectedIds.size})
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={!online}
                    onClick={() => setConfirmMode('all')}
                  >
                    Vaciar historial
                  </button>
                </div>
              </div>
              {!online && (
                <p className="panel-hint">Necesitas conexión para borrar el historial.</p>
              )}
              <ul className="completed-list completed-list-history">
                {payments.map((p) => (
                  <li key={p.id} className="completed-row completed-row-history">
                    <label className="completed-row-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        disabled={!online}
                        onChange={() => toggleSelected(p.id)}
                        aria-label={`Seleccionar ${p.subscription_name ?? 'pago'}`}
                      />
                    </label>
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

      <dialog ref={dialogRef} className="modal" onClose={() => setConfirmMode(null)}>
        <div className="modal-card confirm-modal">
          <h3>{confirmMode === 'all' ? 'Vaciar historial' : 'Eliminar seleccionados'}</h3>
          <p className="confirm-modal-body">
            {confirmMode === 'all'
              ? `¿Borrar los ${payments.length} registros del historial de pagos? No se puede deshacer.`
              : `¿Borrar ${selectedIds.size} registro${selectedIds.size !== 1 ? 's' : ''} del historial? No se puede deshacer.`}
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmMode(null)}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={() => void handleConfirm()}
            >
              {busy ? 'Borrando…' : 'Borrar'}
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
