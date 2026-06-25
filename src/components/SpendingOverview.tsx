import { useMemo, useState } from "react";
import type { Subscription } from "../types/subscription";
import {
  computeCategorySlices,
  computeDayTotals,
  computeMonthlyTotal,
} from "../lib/spending-stats";

interface Props {
  subscriptions: Subscription[];
  budgetLimit?: number | null;
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);
}

function DonutChart({ slices, total }: { slices: ReturnType<typeof computeCategorySlices>; total: number }) {
  if (slices.length === 0) {
    return (
      <div className="chart-donut chart-donut-empty">
        <span className="chart-donut-total">{formatMoney(0)}</span>
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
            stroke={`hsl(${s.hue} 55% 52%)`}
            strokeWidth="10"
            strokeDasharray={s.dash}
            strokeDashoffset={s.offset}
            transform="rotate(-90 36 36)"
          />
        ))}
      </svg>
      <span className="chart-donut-total">{formatMoney(total)}</span>
      <ul className="chart-legend">
        {slices.slice(0, 4).map((s) => (
          <li key={s.category}>
            <span className="chart-legend-dot" style={{ background: `hsl(${s.hue} 55% 52%)` }} />
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
  onPrev,
  onNext,
}: {
  days: ReturnType<typeof computeDayTotals>["days"];
  monthLabel: string;
  maxAmount: number;
  today: number;
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
        <p className="chart-bars-title">{monthLabel}</p>
        <button type="button" className="btn-icon-sm" onClick={onNext} aria-label="Mes siguiente">
          ›
        </button>
      </div>
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
                  ? `${d.day}: ${formatMoney(d.amount)} — ${d.items.map((i) => i.name).join(", ")}`
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
    </div>
  );
}

export function SpendingOverview({ subscriptions, budgetLimit }: Props) {
  const [monthOffset, setMonthOffset] = useState(0);
  const ref = useMemo(() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const now = new Date();
  const isCurrentMonth =
    ref.getUTCFullYear() === now.getUTCFullYear() && ref.getUTCMonth() === now.getUTCMonth();
  const today = isCurrentMonth ? now.getUTCDate() : -1;

  const { days, monthLabel, maxAmount } = computeDayTotals(subscriptions, ref);
  const slices = computeCategorySlices(subscriptions, ref);
  const total = computeMonthlyTotal(subscriptions, ref);

  if (subscriptions.length === 0) return null;

  const budgetPct =
    budgetLimit && budgetLimit > 0 ? Math.min(100, (total / budgetLimit) * 100) : null;

  return (
    <section className="spending-overview" aria-label="Resumen de gastos">
      {budgetPct != null && (
        <div className="budget-bar-wrap">
          <div className="budget-bar-labels">
            <span>Presupuesto</span>
            <span>
              {formatMoney(total)} / {formatMoney(budgetLimit!)}
            </span>
          </div>
          <div className="budget-bar">
            <div
              className={`budget-bar-fill ${budgetPct >= 100 ? "over" : budgetPct >= 80 ? "warn" : ""}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
        </div>
      )}
      <div className="spending-overview-charts">
        <BarChart
          days={days}
          monthLabel={monthLabel}
          maxAmount={maxAmount}
          today={today}
          onPrev={() => setMonthOffset((m) => m - 1)}
          onNext={() => setMonthOffset((m) => m + 1)}
        />
        <DonutChart slices={slices} total={total} />
      </div>
    </section>
  );
}
