import { useEffect, useMemo, useRef, useState } from 'react';
import type { PaymentRecord, Subscription } from '../types/subscription';
import { formatMoney } from '../lib/format-money';
import { categoryColor } from '../lib/categories';
import { UNCATEGORIZED_LABEL } from '../lib/due-dates';

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

function paymentCategory(p: PaymentRecord): string {
  return p.category?.trim() || UNCATEGORIZED_LABEL;
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
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const archivedIds = useMemo(() => new Set(archived.map((s) => s.id)), [archived]);
  const totalCount = archived.length + payments.length;

  /** Categorías presentes en el historial, no el catálogo completo: un chip de
   *  una categoría sin pagos no filtraría nada. */
  const categories = useMemo(() => {
    const set = new Set(payments.map(paymentCategory));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [payments]);

  const filteredPayments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !categoryFilter) return payments;
    return payments.filter((p) => {
      const cat = paymentCategory(p);
      if (categoryFilter && cat !== categoryFilter) return false;
      if (!q) return true;
      // El buscador también matchea la categoría, no solo el nombre: escribir
      // "casa" encuentra los pagos de esa categoría sin tocar los chips.
      const name = (p.subscription_name ?? '').toLowerCase();
      return name.includes(q) || cat.toLowerCase().includes(q);
    });
  }, [payments, query, categoryFilter]);

  /** Totales por moneda del set filtrado — nunca se suman entre monedas. */
  const filteredTotals = useMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const p of filteredPayments) {
      const cur = p.currency || 'MXN';
      byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + p.amount);
    }
    return Array.from(byCurrency);
  }, [filteredPayments]);

  const isFiltering = query.trim() !== '' || categoryFilter != null;

  useEffect(() => {
    // Se poda contra el set *visible*, por dos razones: un registro borrado en
    // otra pestaña no debe seguir marcado, y una fila escondida por el filtro
    // tampoco — si no, «Eliminar seleccionados (N)» contaría pagos que el
    // usuario no tiene en pantalla y borraría más de lo que ve.
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(filteredPayments.map((p) => p.id));
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredPayments]);

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
      prev.size === filteredPayments.length ? new Set() : new Set(filteredPayments.map((p) => p.id))
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
              <div className="history-filters">
                <label className="history-search">
                  <span className="history-search-icon" aria-hidden>
                    ⌕
                  </span>
                  <input
                    type="search"
                    className="history-search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar en el historial"
                    aria-label="Buscar en el historial"
                  />
                </label>
                {categories.length > 1 && (
                  <div
                    className="history-cat-chips"
                    role="group"
                    aria-label="Filtrar por categoría"
                  >
                    <button
                      type="button"
                      className={`history-cat-chip ${categoryFilter == null ? 'active' : ''}`}
                      aria-pressed={categoryFilter == null}
                      onClick={() => setCategoryFilter(null)}
                    >
                      Todas
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={`history-cat-chip ${categoryFilter === cat ? 'active' : ''}`}
                        aria-pressed={categoryFilter === cat}
                        onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                      >
                        <span
                          className="history-cat-chip-dot"
                          style={{ background: categoryColor(cat) }}
                          aria-hidden
                        />
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
                <p className="history-filters-count">
                  {filteredPayments.length}{' '}
                  {filteredPayments.length === 1 ? 'registro' : 'registros'}
                  {filteredTotals.length > 0 && ' · '}
                  {filteredTotals.map(([currency, amount], i) => (
                    <span key={currency}>
                      {i > 0 && ' · '}
                      {formatMoney(amount, currency)} en total
                    </span>
                  ))}
                </p>
              </div>
              <div className="register-completed-history-head">
                <label className="checkbox-label completed-select-all">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === filteredPayments.length}
                    disabled={!online || filteredPayments.length === 0}
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
              {filteredPayments.length === 0 && (
                <p className="panel-hint">
                  {query.trim() !== ''
                    ? `Sin resultados para «${query.trim()}».`
                    : 'Sin pagos en esta categoría.'}
                </p>
              )}
              <ul className="completed-list completed-list-history">
                {filteredPayments.map((p) => (
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
                        {p.subscription_id != null &&
                          archivedIds.has(p.subscription_id) &&
                          ' · archivado'}
                      </p>
                    </div>
                    <div className="completed-amount">
                      <p className="completed-amount-value">{formatMoney(p.amount, p.currency)}</p>
                      {p.currency === 'USD' && p.fx_usd_mxn != null && (
                        <p className="completed-amount-fx-hint">
                          ≈ {formatMoney(p.amount * p.fx_usd_mxn, 'MXN')}
                        </p>
                      )}
                    </div>
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
              ? // Vaciar borra el historial completo, no el filtro activo — se dice
                // explícitamente porque en pantalla puede haber muchos menos.
                `¿Borrar los ${payments.length} registros del historial de pagos${
                  isFiltering ? ', incluidos los que el filtro no muestra' : ''
                }? No se puede deshacer.`
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
