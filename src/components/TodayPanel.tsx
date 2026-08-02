import { ActionIcon } from './ActionIcon';
import { useMemo } from 'react';
import type { PaymentRecord, Subscription } from '../types/subscription';
import { daysUntilNextDue, formatDueLabel, partitionByUrgency } from '../lib/due-dates';
import { computeBudgetOutlook } from '../lib/spending-stats';
import { formatMoney } from '../lib/format-money';

interface Props {
  subscriptions: Subscription[];
  payments: PaymentRecord[];
  budgetLimit: number | null;
  /** Subscription ids currently in the check-then-undo grace period. */
  confirmingIds: Set<string>;
  onStartConfirm: (sub: Subscription) => void;
  onCancelConfirm: (subId: string) => void;
  onMarkPaidDetailed?: (sub: Subscription) => void;
  onMarkAllPaid: (subs: Subscription[]) => void;
  onEdit: (sub: Subscription) => void;
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
  confirming,
  onStartConfirm,
  onCancelConfirm,
  onMarkPaidDetailed,
  onEdit,
  variant,
}: {
  sub: Subscription;
  confirming: boolean;
  onStartConfirm: (sub: Subscription) => void;
  onCancelConfirm: (subId: string) => void;
  onMarkPaidDetailed?: (sub: Subscription) => void;
  onEdit: (sub: Subscription) => void;
  variant: 'overdue' | 'today' | 'soon';
}) {
  const days = daysUntilNextDue(sub);
  const label = formatDueLabel(sub, days);

  return (
    <li className={`today-row today-row-${variant}${confirming ? ' today-row-confirming' : ''}`}>
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
          <button
            type="button"
            className="btn-text btn-text-sm"
            onClick={() => onCancelConfirm(sub.id)}
          >
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
              onClick={() => onStartConfirm(sub)}
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

const MONTH_LABEL = new Intl.DateTimeFormat('es-MX', { month: 'long' });

function BudgetCard({
  subscriptions,
  payments,
  budgetLimit,
}: {
  subscriptions: Subscription[];
  payments: PaymentRecord[];
  budgetLimit: number;
}) {
  const outlook = useMemo(
    () => computeBudgetOutlook(subscriptions, payments, budgetLimit),
    [subscriptions, payments, budgetLimit]
  );

  const paidPct = Math.min(100, (outlook.spent / budgetLimit) * 100);
  const upcomingPct = Math.min(100 - paidPct, (outlook.upcoming / budgetLimit) * 100);
  const level =
    outlook.pctOfBudget == null
      ? 'normal'
      : outlook.pctOfBudget >= 100
        ? 'over'
        : outlook.pctOfBudget >= 85
          ? 'warn'
          : 'normal';
  const month = MONTH_LABEL.format(new Date());

  return (
    <div className="budget-hero panel-card">
      <p className="budget-hero-eyebrow">Presupuesto de {month}</p>
      <p className="budget-hero-amount">{formatMoney(outlook.spent, 'MXN')}</p>
      <p className="budget-hero-meta">
        de {formatMoney(budgetLimit, 'MXN')} presupuestados · quedan{' '}
        {formatMoney(Math.max(0, outlook.remaining), 'MXN')}
      </p>
      <div className={`budget-hero-bar budget-hero-bar-${level}`}>
        <div className="budget-hero-bar-paid" style={{ width: `${paidPct}%` }} />
        <div className="budget-hero-bar-upcoming" style={{ width: `${upcomingPct}%` }} />
      </div>
      <div className={`budget-hero-legend budget-hero-legend-${level}`}>
        <span>
          <i className="budget-hero-dot budget-hero-dot-paid" /> Pagado
        </span>
        <span>
          <i className="budget-hero-dot budget-hero-dot-upcoming" /> Por pagar
        </span>
      </div>
      {level !== 'normal' && (
        <p className={`budget-hero-alert budget-hero-alert-${level}`}>
          Al ritmo actual cierras {month} en {formatMoney(outlook.projectedTotal, 'MXN')}
          {outlook.projectedTotal > budgetLimit
            ? `, ${formatMoney(outlook.projectedTotal - budgetLimit, 'MXN')} sobre tu presupuesto.`
            : '.'}
        </p>
      )}
      <p className="budget-hero-perday">
        Puedes gastar por día <strong>{formatMoney(outlook.perDay, 'MXN')}</strong>
      </p>
    </div>
  );
}

export function TodayPanel({
  subscriptions,
  payments,
  budgetLimit,
  confirmingIds,
  onStartConfirm,
  onCancelConfirm,
  onMarkPaidDetailed,
  onMarkAllPaid,
  onEdit,
}: Props) {
  const { overdue, today, soon } = useMemo(
    () => partitionByUrgency(subscriptions),
    [subscriptions]
  );

  const actionItems = [...overdue, ...today];
  const hasBudget = budgetLimit != null && budgetLimit > 0;

  if (actionItems.length === 0 && soon.length === 0) {
    return (
      <section className="today-panel today-panel-clear" aria-label="Estado de hoy">
        {hasBudget && (
          <BudgetCard subscriptions={subscriptions} payments={payments} budgetLimit={budgetLimit} />
        )}
        <p className="today-panel-clear-title">Nada pendiente hoy</p>
        <p className="today-panel-clear-sub">Todo al día por ahora.</p>
      </section>
    );
  }

  const totalsByCurrency = sumByCurrency(actionItems);

  return (
    <section className="today-panel" aria-label="Pagos pendientes">
      {hasBudget && (
        <BudgetCard subscriptions={subscriptions} payments={payments} budgetLimit={budgetLimit} />
      )}
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
                confirming={confirmingIds.has(sub.id)}
                variant={daysUntilNextDue(sub)! < 0 ? 'overdue' : 'today'}
                onStartConfirm={onStartConfirm}
                onCancelConfirm={onCancelConfirm}
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
                confirming={confirmingIds.has(sub.id)}
                variant="soon"
                onStartConfirm={onStartConfirm}
                onCancelConfirm={onCancelConfirm}
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
