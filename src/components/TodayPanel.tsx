import { ActionIcon } from './ActionIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Subscription } from '../types/subscription';
import { daysUntilNextDue, formatDueLabel, partitionByUrgency } from '../lib/due-dates';

/** Grace period between tapping "check" and the mark-paid mutation actually firing. */
const CONFIRM_MS = 4000;

interface Props {
  subscriptions: Subscription[];
  onMarkPaid: (sub: Subscription) => void;
  onMarkPaidDetailed?: (sub: Subscription) => void;
  onMarkAllPaid: (subs: Subscription[]) => void;
  onEdit: (sub: Subscription) => void;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
}

function sumByCurrency(subs: Subscription[]) {
  const map = new Map<string, number>();
  for (const s of subs) {
    const c = s.currency || 'MXN';
    map.set(c, (map.get(c) ?? 0) + s.amount);
  }
  return map;
}

function ActionRow({
  sub,
  onMarkPaid,
  onMarkPaidDetailed,
  onEdit,
  variant,
}: {
  sub: Subscription;
  onMarkPaid: (sub: Subscription) => void;
  onMarkPaidDetailed?: (sub: Subscription) => void;
  onEdit: (sub: Subscription) => void;
  variant: 'overdue' | 'today' | 'soon';
}) {
  const days = daysUntilNextDue(sub);
  const label = formatDueLabel(sub, days);
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const startConfirm = () => {
    setConfirming(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setLeaving(true);
      onMarkPaid(sub);
    }, CONFIRM_MS);
  };

  const cancelConfirm = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setConfirming(false);
  };

  return (
    <li
      className={`today-row today-row-${variant}${confirming ? ' today-row-confirming' : ''}${leaving ? ' today-row-leaving' : ''}`}
    >
      <div className="today-row-main">
        <span className="today-row-name">{sub.name}</span>
        <span className="today-row-meta">
          <span
            className={`badge badge-due badge-due-${variant === 'overdue' ? 'past' : variant === 'today' ? 'today' : 'soon'}`}
          >
            {label}
          </span>
          <span className="today-row-amount">{formatMoney(sub.amount, sub.currency)}</span>
        </span>
      </div>
      {confirming ? (
        <div className="today-row-actions today-row-actions-confirming">
          <span className="today-row-confirmed-check" aria-hidden>
            <ActionIcon name="check" />
          </span>
          <button type="button" className="btn-text btn-text-sm" onClick={cancelConfirm}>
            Deshacer
          </button>
        </div>
      ) : (
        <div className="today-row-actions">
          {variant !== 'soon' && (
            <button
              type="button"
              className="btn-icon btn-icon-ok"
              title="Marcar pagado"
              aria-label={`Marcar ${sub.name} como pagado`}
              onClick={startConfirm}
            >
              <ActionIcon name="check" />
            </button>
          )}
          <button type="button" className="btn-text btn-text-sm" onClick={() => onEdit(sub)}>
            Editar
          </button>
          {onMarkPaidDetailed && variant !== 'soon' && (
            <button
              type="button"
              className="btn-text btn-text-sm"
              onClick={() => onMarkPaidDetailed(sub)}
            >
              Monto/fecha
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function TodayPanel({
  subscriptions,
  onMarkPaid,
  onMarkPaidDetailed,
  onMarkAllPaid,
  onEdit,
}: Props) {
  const { overdue, today, soon } = useMemo(
    () => partitionByUrgency(subscriptions),
    [subscriptions]
  );

  const actionItems = [...overdue, ...today];
  if (actionItems.length === 0 && soon.length === 0) {
    return (
      <section className="today-panel today-panel-clear" aria-label="Estado de hoy">
        <p className="today-panel-clear-title">Nada pendiente hoy</p>
        <p className="today-panel-clear-sub">Todo al día por ahora.</p>
      </section>
    );
  }

  const totalsByCurrency = sumByCurrency(actionItems);

  return (
    <section className="today-panel" aria-label="Pagos pendientes">
      {actionItems.length > 0 && (
        <div className="today-panel-block">
          <div className="today-panel-head">
            <div>
              <h2 className="today-panel-title">
                {overdue.length > 0 && today.length > 0
                  ? 'Pendientes y hoy'
                  : overdue.length > 0
                    ? 'Vencidos'
                    : 'Hoy'}
              </h2>
              <p className="today-panel-sub">
                {actionItems.length} pago{actionItems.length !== 1 ? 's' : ''}
                {Array.from(totalsByCurrency.entries()).map(([cur, amt]) => (
                  <span key={cur} className="today-panel-total-line">
                    {' '}
                    · {formatMoney(amt, cur)}
                  </span>
                ))}
              </p>
            </div>
            {actionItems.length > 1 && (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => onMarkAllPaid(actionItems)}
              >
                Marcar todos
              </button>
            )}
          </div>
          <ul className="today-list">
            {actionItems.map((sub) => (
              <ActionRow
                key={sub.id}
                sub={sub}
                variant={daysUntilNextDue(sub)! < 0 ? 'overdue' : 'today'}
                onMarkPaid={onMarkPaid}
                onMarkPaidDetailed={onMarkPaidDetailed}
                onEdit={onEdit}
              />
            ))}
          </ul>
        </div>
      )}

      {soon.length > 0 && (
        <div className="today-panel-block today-panel-soon">
          <h3 className="today-panel-soon-title">Próximos 7 días</h3>
          <ul className="today-list today-list-compact">
            {soon.slice(0, 5).map((sub) => (
              <ActionRow
                key={sub.id}
                sub={sub}
                variant="soon"
                onMarkPaid={onMarkPaid}
                onMarkPaidDetailed={onMarkPaidDetailed}
                onEdit={onEdit}
              />
            ))}
            {soon.length > 5 && (
              <li className="today-row today-row-more">+{soon.length - 5} más esta semana</li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
