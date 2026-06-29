import { ActionIcon } from "./ActionIcon";
import { useMemo, useState } from "react";
import type { Subscription } from "../types/subscription";
import { categoryAccentHue } from "../lib/category-groups";
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
  /** Oculta el resumen por moneda cuando el hero ya muestra los totales. */
  hideCurrencySummary?: boolean;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function formatMoneyShort(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);
}

function shouldShowDayLabel(day: number, totalDays: number, step: number): boolean {
  if (day === 1 || day === totalDays) return true;
  if (step <= 1) return true;
  return (day - 1) % step === 0;
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
      <div className="chart-donut-panel chart-donut-panel-empty">
        <div className="chart-donut-ring chart-donut-ring-empty" aria-hidden>
          <span className="chart-donut-total">{formatMoneyShort(0, currency)}</span>
          <span className="chart-donut-sub">est. mes</span>
        </div>
        <p className="chart-empty-caption">Sin categorías aún</p>
      </div>
    );
  }

  const r = 38;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segments = slices.map((s) => {
    const hue = categoryAccentHue(s.category);
    const len = (s.pct / 100) * c;
    const seg = {
      ...s,
      hue,
      dash: `${len} ${c - len}`,
      offset: -offset,
      stroke: `hsl(${hue} 48% 44%)`,
    };
    offset += len;
    return seg;
  });

  return (
    <div className="chart-donut-panel">
      <div className="chart-donut-ring">
        <svg viewBox="0 0 100 100" className="chart-donut-svg" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth="11"
          />
          {segments.map((s) => (
            <circle
              key={s.category}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={s.stroke}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={s.dash}
              strokeDashoffset={s.offset}
              transform="rotate(-90 50 50)"
            />
          ))}
        </svg>
        <div className="chart-donut-center">
          <span className="chart-donut-total">{formatMoneyShort(total, currency)}</span>
          <span className="chart-donut-sub">est. mes</span>
        </div>
      </div>
      <ul className="chart-legend chart-legend-rich">
        {slices.slice(0, 5).map((s) => {
          const hue = categoryAccentHue(s.category);
          return (
            <li key={s.category}>
              <span
                className="chart-legend-dot"
                style={{ background: `hsl(${hue} 48% 44%)` }}
              />
              <span className="chart-legend-label">{s.category}</span>
              <span className="chart-legend-amt">{formatMoneyShort(s.amount, currency)}</span>
              <span className="chart-legend-pct">{Math.round(s.pct)}%</span>
            </li>
          );
        })}
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
  monthTotal,
  empty,
  onPrev,
  onNext,
}: {
  days: ReturnType<typeof computeDayTotals>["days"];
  monthLabel: string;
  maxAmount: number;
  today: number;
  currency: string;
  monthTotal: number;
  empty?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const step = days.length > 20 ? 5 : days.length > 14 ? 3 : 1;

  return (
    <div className="chart-bars-panel">
      <div className="chart-bars-head">
        <button type="button" className="btn-icon-sm" onClick={onPrev} aria-label="Mes anterior">
          <ActionIcon name="chevron-left" />
        </button>
        <div className="chart-bars-head-text">
          <p className="chart-bars-title">{monthLabel}</p>
          <p className="chart-bars-total">
            <span className="currency-badge currency-badge-sm">{currency}</span>
            {formatMoney(monthTotal, currency)}
          </p>
        </div>
        <button type="button" className="btn-icon-sm" onClick={onNext} aria-label="Mes siguiente">
          <ActionIcon name="chevron-right" />
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
        <div className="chart-bars-track" role="img" aria-label={`Pagos por día en ${monthLabel}`}>
          <div className="chart-bars">
            {days.map((d) => {
              const h = d.amount > 0 ? Math.max(10, (d.amount / maxAmount) * 100) : 4;
              const isToday = d.day === today;
              const hasPay = d.amount > 0;
              const showLabel = shouldShowDayLabel(d.day, days.length, step);
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
                  <div className="chart-bar-shell">
                    <div className="chart-bar" style={{ height: `${h}%` }} />
                  </div>
                  {showLabel ? (
                    <span className="chart-bar-label">{d.day}</span>
                  ) : (
                    <span className="chart-bar-label" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function SpendingOverview({
  subscriptions,
  budgetLimit,
  defaultExpanded = false,
  hideCurrencySummary = false,
}: Props) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [expanded, setExpanded] = useState(defaultExpanded || hideCurrencySummary);
  const isEmpty = subscriptions.length === 0;

  const ref = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
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
    ref.getFullYear() === now.getFullYear() && ref.getMonth() === now.getMonth();
  const today = isCurrentMonth ? now.getDate() : -1;

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
    <section
      className={`spending-overview${hideCurrencySummary ? " spending-overview-embedded" : ""}`}
      aria-label="Resumen de gastos"
    >
      {isEmpty && (
        <p className="spending-overview-hint">Sin pagos — registra uno para ver el resumen.</p>
      )}

      {!hideCurrencySummary && (currencies.length > 1 || !isEmpty) && (
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
            monthTotal={total}
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
