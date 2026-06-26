import { useMemo, useState } from "react";
import type { Subscription } from "../types/subscription";
import {
  computeCategorySlices,
  computeDayTotals,
  computeMonthlyTotal,
  computeTotalsByCurrency,
} from "../lib/spending-stats";

interface Props {
  subscriptions: Subscription[];
  budgetLimit?: number | null;
  defaultExpanded?: boolean;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function DonutChart({
  slices,
  total,
  currency,
  empty,
}: {
  slices: ReturnType<typeof computeCategorySlices>;
  total: number;
  currency: string;
  empty?: boolean;
}) {
  if (empty || slices.length === 0) {
    return (
      <div className="chart-donut-wrap chart-donut-empty-wrap">
        <div className="chart-donut chart-donut-empty">
          <span className="chart-donut-total">{formatMoney(0, currency)}</span>
        </div>
        <p className="chart-empty-caption">Sin categorías aún</p>
      </div>
    );
  }

  let offset = 0;
  const r = 28;
  const c = 2 * Math.PI * r;
  const segments = slices.map((s) => {
    const len = (s.pct / 100) * c;
    const seg = { ...s, dash: `${len} ${c - len}`, offset: -offset };
    offset += len;
    return seg;
  });

  return (
    <div className="chart-donut-wrap">
      <svg viewBox="0 0 72 72" className="chart-donut" aria-hidden>
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
        {segments.map((s) => (
          <circle
            key={s.category}
            cx="36"
            cy="36"
            r={r}
            fill="none"
            stroke={`hsl(${s.hue} 42% 42%)`}
            strokeWidth="10"
            strokeDasharray={s.dash}
            strokeDashoffset={s.offset}
            transform="rotate(-90 36 36)"
          />
        ))}
      </svg>
      <span className="chart-donut-total">{formatMoney(total, currency)}</span>
      <ul className="chart-legend">
        {slices.slice(0, 4).map((s) => (
          <li key={s.category}>
            <span className="chart-legend-dot" style={{ background: `hsl(${s.hue} 42% 42%)` }} />
            <span className="chart-legend-label">{s.category}</span>
            <span className="chart-legend-pct">{Math.round(s.pct)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarChart({
  days,
  monthLabel,
  maxAmount,
  today,
  currency,
  empty,
  onPrev,
  onNext,
}: {
  days: ReturnType<typeof computeDayTotals>["days"];
  monthLabel: string;
  maxAmount: number;
  today: number;
  currency: string;
  empty?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const showEvery = days.length > 20 ? 5 : days.length > 14 ? 3 : 1;

  return (
    <div className="chart-bars-wrap">
      <div className="chart-bars-head">
        <button type="button" className="btn-icon-sm" onClick={onPrev} aria-label="Mes anterior">
          ‹
        </button>
        <p className="chart-bars-title">
          {monthLabel}
          <span className="currency-badge currency-badge-sm">{currency}</span>
        </p>
        <button type="button" className="btn-icon-sm" onClick={onNext} aria-label="Mes siguiente">
          ›
        </button>
      </div>
      {empty ? (
        <div className="chart-bars-empty">
          <div className="chart-bars-empty-bars" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className="chart-bars-empty-bar" />
            ))}
          </div>
          <p className="chart-empty-caption">Registra un pago para ver el calendario del mes</p>
        </div>
      ) : (
        <div className="chart-bars" role="img" aria-label={`Pagos por día en ${monthLabel}`}>
          {days.map((d) => {
            const h = d.amount > 0 ? Math.max(8, (d.amount / maxAmount) * 100) : 2;
            const isToday = d.day === today;
            const hasPay = d.amount > 0;
            return (
              <div
                key={d.day}
                className={`chart-bar-col ${isToday ? "chart-bar-today" : ""} ${hasPay ? "chart-bar-has" : ""}`}
                title={
                  hasPay
                    ? `${d.day}: ${formatMoney(d.amount, currency)} — ${d.items.map((i) => i.name).join(", ")}`
                    : `${d.day}`
                }
              >
                <div className="chart-bar" style={{ height: `${h}%` }} />
                {d.day % showEvery === 1 || d.day === days.length ? (
                  <span className="chart-bar-label">{d.day}</span>
                ) : (
                  <span className="chart-bar-label" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SpendingOverview({ subscriptions, budgetLimit, defaultExpanded = false }: Props) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isEmpty = subscriptions.length === 0;

  const ref = useMemo(() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const currencies = useMemo(() => {
    if (isEmpty) return ["MXN"];
    const set = new Set(subscriptions.map((s) => s.currency || "MXN"));
    return Array.from(set).sort();
  }, [subscriptions, isEmpty]);

  const currencyTotals = useMemo(
    () => computeTotalsByCurrency(subscriptions, ref),
    [subscriptions, ref],
  );

  const now = new Date();
  const isCurrentMonth =
    ref.getUTCFullYear() === now.getUTCFullYear() && ref.getUTCMonth() === now.getUTCMonth();
  const today = isCurrentMonth ? now.getUTCDate() : -1;

  const primaryCurrency = currencies[0] ?? "MXN";
  const primarySubs = subscriptions.filter((s) => (s.currency || "MXN") === primaryCurrency);
  const { days, monthLabel, maxAmount } = computeDayTotals(primarySubs, ref);
  const slices = computeCategorySlices(primarySubs, ref);
  const total = computeMonthlyTotal(primarySubs, ref);

  const budgetCurrency = "MXN";
  const budgetTotal = currencyTotals[budgetCurrency]?.monthly ?? 0;
  const budgetPct =
    budgetLimit && budgetLimit > 0 ? Math.min(100, (budgetTotal / budgetLimit) * 100) : null;

  return (
    <section className="spending-overview" aria-label="Resumen de gastos">
      {isEmpty && (
        <p className="spending-overview-hint">
          Sin pagos activos — el panel se llena cuando registres tu primer cobro.
        </p>
      )}

      {(currencies.length > 1 || !isEmpty) && (
        <div className="spending-currency-summary">
          {currencies.map((cur) => (
            <span key={cur} className="spending-currency-line">
              <span className="currency-badge currency-badge-sm">{cur}</span>
              {formatMoney(currencyTotals[cur]?.monthly ?? 0, cur)}/mes
            </span>
          ))}
        </div>
      )}

      {budgetLimit != null && budgetLimit > 0 && (
        <div className="budget-bar-wrap">
          <div className="budget-bar-labels">
            <span>
              Presupuesto <span className="currency-badge currency-badge-sm">{budgetCurrency}</span>
            </span>
            <span>
              {formatMoney(budgetTotal, budgetCurrency)} / {formatMoney(budgetLimit, budgetCurrency)}
            </span>
          </div>
          <div className="budget-bar">
            <div
              className={`budget-bar-fill ${budgetPct != null && budgetPct >= 100 ? "over" : budgetPct != null && budgetPct >= 80 ? "warn" : ""}`}
              style={{ width: `${budgetPct ?? 0}%` }}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn-text spending-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? "Ocultar gráficos" : "Ver análisis mensual"}
      </button>

      {expanded && (
        <div className="spending-overview-charts">
          <BarChart
            days={days}
            monthLabel={monthLabel}
            maxAmount={maxAmount}
            today={today}
            currency={primaryCurrency}
            empty={isEmpty}
            onPrev={() => setMonthOffset((m) => m - 1)}
            onNext={() => setMonthOffset((m) => m + 1)}
          />
          <DonutChart slices={slices} total={total} currency={primaryCurrency} empty={isEmpty} />
        </div>
      )}
    </section>
  );
}
