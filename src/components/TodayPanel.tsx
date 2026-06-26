import { useMemo } from "react";
import type { Subscription } from "../types/subscription";
import { daysUntilNextDue, formatDueLabel, partitionByUrgency } from "../lib/due-dates";

interface Props {
  subscriptions: Subscription[];
  onMarkPaid: (sub: Subscription) => void;
  onMarkAllPaid: (subs: Subscription[]) => void;
  onMarkPaidDetail: (sub: Subscription) => void;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function sumAmounts(subs: Subscription[]) {
  return subs.reduce((sum, s) => sum + s.amount, 0);
}

function ActionRow({
  sub,
  onMarkPaid,
  onMarkPaidDetail,
  variant,
}: {
  sub: Subscription;
  onMarkPaid: (sub: Subscription) => void;
  onMarkPaidDetail: (sub: Subscription) => void;
  variant: "overdue" | "today" | "soon";
}) {
  const days = daysUntilNextDue(sub);
  const label = formatDueLabel(sub, days);

  return (
    <li className={`today-row today-row-${variant}`}>
      <div className="today-row-main">
        <span className="today-row-name">{sub.name}</span>
        <span className="today-row-meta">
          <span className={`badge badge-due badge-due-${variant === "overdue" ? "past" : variant === "today" ? "today" : "soon"}`}>
            {label}
          </span>
          <span className="today-row-amount">{formatMoney(sub.amount, sub.currency)}</span>
        </span>
      </div>
      <div className="today-row-actions">
        {variant !== "soon" && (
          <button
            type="button"
            className="btn-icon btn-icon-ok"
            title="Marcar pagado"
            aria-label={`Marcar ${sub.name} como pagado`}
            onClick={() => onMarkPaid(sub)}
          >
            ✓
          </button>
        )}
        <button
          type="button"
          className="btn-text btn-text-sm"
          onClick={() => onMarkPaidDetail(sub)}
        >
          Detalle
        </button>
      </div>
    </li>
  );
}

export function TodayPanel({
  subscriptions,
  onMarkPaid,
  onMarkAllPaid,
  onMarkPaidDetail,
}: Props) {
  const { overdue, today, soon } = useMemo(
    () => partitionByUrgency(subscriptions),
    [subscriptions],
  );

  const actionItems = [...overdue, ...today];
  if (actionItems.length === 0 && soon.length === 0) return null;

  const actionTotal = sumAmounts(actionItems);
  const actionCurrency = actionItems[0]?.currency ?? "MXN";

  return (
    <section className="today-panel" aria-label="Pagos pendientes">
      {actionItems.length > 0 && (
        <div className="today-panel-block">
          <div className="today-panel-head">
            <div>
              <h2 className="today-panel-title">
                {overdue.length > 0 && today.length > 0
                  ? "Pendientes y hoy"
                  : overdue.length > 0
                    ? "Vencidos"
                    : "Hoy"}
              </h2>
              <p className="today-panel-sub">
                {actionItems.length} pago{actionItems.length !== 1 ? "s" : ""} ·{" "}
                {formatMoney(actionTotal, actionCurrency)}
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
                variant={daysUntilNextDue(sub)! < 0 ? "overdue" : "today"}
                onMarkPaid={onMarkPaid}
                onMarkPaidDetail={onMarkPaidDetail}
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
                onMarkPaidDetail={onMarkPaidDetail}
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
