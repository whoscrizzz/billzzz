import { ActionIcon } from './ActionIcon';
import { useMemo, useState } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { PaymentRecord, Subscription } from '../types/subscription';
import { categoryColor } from '../lib/categories';
import {
  type CategoryRange,
  computeCategorySlices,
  computeCategoryTotals,
  computeMonthComparison,
  computePriceIncreases,
  computeTotalsByCurrency,
} from '../lib/spending-stats';
import { formatMoney } from '../lib/format-money';

interface Props {
  subscriptions: Subscription[];
  payments: PaymentRecord[];
  budgetLimit?: number | null;
  defaultExpanded?: boolean;
  /** Oculta el resumen por moneda cuando el hero ya muestra los totales. */
  hideCurrencySummary?: boolean;
}

/** "A dónde se va" — desglose por categoría en barras, panel lateral de
 * escritorio (computeCategorySlices, estimado mensual). */
function CategoryBarsPanel({
  slices,
  currency,
  empty,
}: {
  slices: ReturnType<typeof computeCategorySlices>;
  currency: string;
  empty?: boolean;
}) {
  return (
    <div className="category-bars-panel">
      <p className="category-bars-title">A dónde se va</p>
      {empty || slices.length === 0 ? (
        <p className="chart-empty-caption">Sin categorías aún</p>
      ) : (
        <ul className="category-bars-list">
          {slices.map((s) => {
            const color = categoryColor(s.category);
            return (
              <li key={s.category} className="category-bars-row">
                <div className="category-bars-row-head">
                  <span className="category-bars-row-label">
                    <span className="category-bars-dot" style={{ background: color }} />
                    {s.category}
                  </span>
                  <span className="category-bars-row-pct">{Math.round(s.pct)}%</span>
                </div>
                <div className="category-bars-bar">
                  <div
                    className="category-bars-bar-fill"
                    style={{ width: `${s.pct}%`, background: color }}
                  />
                </div>
                <p className="category-bars-amount">{formatMoney(s.amount, currency)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDayMonth(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(d);
}

function PriceIncreasesPanel({
  payments,
  currency,
}: {
  payments: PaymentRecord[];
  currency: string;
}) {
  const increases = useMemo(() => computePriceIncreases(payments), [payments]);
  if (increases.length === 0) return null;

  return (
    <div className="price-increases-panel">
      <div className="price-increases-head">
        <span className="price-increases-badge" aria-hidden>
          <ActionIcon name="trending-up" />
        </span>
        <h3 className="price-increases-title">Subieron de precio</h3>
      </div>
      <ul className="price-increases-list">
        {increases.map((inc) => (
          <li key={inc.name} className="price-increases-row">
            <span className="price-increases-name">{inc.name}</span>
            <span className="price-increases-change">
              {formatMoney(inc.before, currency)} → {formatMoney(inc.after, currency)}
            </span>
            <span className="price-increases-diff">
              +{formatMoney(inc.diff, currency)}
              <span className="price-increases-pct"> · {Math.round(inc.pct)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MonthComparisonPanel({
  payments,
  currency,
}: {
  payments: PaymentRecord[];
  currency: string;
}) {
  const comparison = useMemo(() => computeMonthComparison(payments), [payments]);
  if (comparison.lastTotal === 0 && comparison.thisTotal === 0) return null;

  // Sin pagos este mes todavía: no hay una cifra de diferencia real que
  // mostrar (el "−$X" leería como que ya se gastó menos, cuando en realidad
  // no se pagó nada). Solo la nota.
  if (comparison.thisTotal === 0) {
    return (
      <div className="month-comparison-panel">
        <p className="month-comparison-note">{comparison.note}</p>
      </div>
    );
  }

  return (
    <div className="month-comparison-panel">
      <p
        className={`month-comparison-figure ${comparison.diff > 0 ? 'month-comparison-up' : comparison.diff < 0 ? 'month-comparison-down' : ''}`}
      >
        {comparison.diff > 0 ? '+' : ''}
        {formatMoney(comparison.diff, currency)}
      </p>
      <p className="month-comparison-note">{comparison.note}</p>
    </div>
  );
}

function CurrencyTotalsPanel({
  currencies,
  totals,
}: {
  currencies: string[];
  totals: Record<string, { monthly: number; annual: number }>;
}) {
  return (
    <div className="currency-totals-panel">
      <h3 className="currency-totals-title">Totales por moneda</h3>
      <ul className="currency-totals-list">
        {currencies.map((cur) => (
          <li key={cur} className="currency-totals-row">
            <span className="currency-badge currency-badge-sm">{cur}</span>
            <span>{formatMoney(totals[cur]?.monthly ?? 0, cur)}/mes</span>
            <span className="currency-totals-annual">
              {formatMoney(totals[cur]?.annual ?? 0, cur)}/año
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryTotalsPanel({
  subscriptions,
  payments,
  currency,
}: {
  subscriptions: Subscription[];
  payments: PaymentRecord[];
  currency: string;
}) {
  const [range, setRange] = useState<CategoryRange>('month');
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const totals = useMemo(
    () => computeCategoryTotals(subscriptions, payments, range),
    [subscriptions, payments, range]
  );
  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);

  return (
    <div className="category-totals-panel">
      <div className="layout-toggle category-totals-range" role="tablist">
        <button
          type="button"
          role="tab"
          className={`layout-toggle-btn ${range === 'month' ? 'active' : ''}`}
          onClick={() => {
            setRange('month');
            setOpenCategory(null);
          }}
        >
          Mes
        </button>
        <button
          type="button"
          role="tab"
          className={`layout-toggle-btn ${range === 'quarter' ? 'active' : ''}`}
          onClick={() => {
            setRange('quarter');
            setOpenCategory(null);
          }}
        >
          3 meses
        </button>
      </div>

      {totals.length === 0 ? (
        <p className="chart-empty-caption">Sin pagos registrados en este rango.</p>
      ) : (
        <ul className="category-totals-list">
          {totals.map((t) => {
            const isOpen = openCategory === t.category;
            return (
              <li key={t.category} className="category-totals-row">
                <button
                  type="button"
                  className="category-totals-row-head"
                  onClick={() => setOpenCategory(isOpen ? null : t.category)}
                  aria-expanded={isOpen}
                >
                  <span
                    className="category-totals-dot"
                    style={{ background: categoryColor(t.category) }}
                  />
                  <span className="category-totals-name">{t.category}</span>
                  <span className="category-totals-total">{formatMoney(t.total, currency)}</span>
                  <span
                    className={`category-totals-chevron ${isOpen ? 'category-totals-chevron-open' : ''}`}
                    aria-hidden
                  >
                    <ActionIcon name="chevron-right" />
                  </span>
                </button>
                <div className="category-totals-meta">
                  <span>
                    {t.count} pago{t.count !== 1 ? 's' : ''} · prom. {formatMoney(t.avg, currency)}
                  </span>
                  <span>{Math.round(t.pct)}%</span>
                </div>
                <div className="category-totals-bar">
                  <div
                    className="category-totals-bar-fill"
                    style={{ width: `${t.pct}%`, background: categoryColor(t.category) }}
                  />
                </div>
                {isOpen && (
                  <ul className="category-totals-breakdown">
                    {t.payments.map((p, i) => (
                      <li key={i}>
                        <span>{p.name}</span>
                        <span>{formatDayMonth(p.paid_at)}</span>
                        <span>{formatMoney(p.amount, currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totals.length > 0 && (
        <div className="category-totals-footer">
          <span>{range === 'month' ? 'Este mes' : 'Últimos 3 meses'}</span>
          <span className="category-totals-grand">{formatMoney(grandTotal, currency)}</span>
        </div>
      )}
    </div>
  );
}

export function SpendingOverview({
  subscriptions,
  payments,
  budgetLimit,
  defaultExpanded = false,
  hideCurrencySummary = false,
}: Props) {
  const isPhone = useMediaQuery('(max-width: 767px)');
  const [expanded, setExpanded] = useState(defaultExpanded || (hideCurrencySummary && !isPhone));
  const isEmpty = subscriptions.length === 0;

  // Siempre mes actual: la navegación mes-a-mes vive en CalendarView.tsx
  // (pestaña Calendario) desde que el grid visual se mudó ahí.
  const ref = useMemo(() => new Date(), []);

  const currencies = useMemo(() => {
    if (isEmpty) return ['MXN'];
    const set = new Set(subscriptions.map((s) => s.currency || 'MXN'));
    return Array.from(set).sort();
  }, [subscriptions, isEmpty]);

  const currencyTotals = useMemo(
    () => computeTotalsByCurrency(subscriptions, ref),
    [subscriptions, ref]
  );

  const primaryCurrency = currencies[0] ?? 'MXN';
  const primarySubs = subscriptions.filter((s) => (s.currency || 'MXN') === primaryCurrency);
  const primaryPayments = payments.filter((p) => (p.currency || 'MXN') === primaryCurrency);
  const slices = computeCategorySlices(primarySubs, ref);

  const budgetCurrency = 'MXN';
  const budgetTotal = currencyTotals[budgetCurrency]?.monthly ?? 0;
  const budgetPct =
    budgetLimit && budgetLimit > 0 ? Math.min(100, (budgetTotal / budgetLimit) * 100) : null;

  return (
    <section
      className={`spending-overview${hideCurrencySummary ? ' spending-overview-embedded' : ''}`}
      aria-label="Resumen de gastos"
    >
      {isEmpty && (
        <p className="spending-overview-hint">Sin pagos — registra uno para ver el resumen.</p>
      )}

      {budgetLimit != null && budgetLimit > 0 && (
        <div className="budget-bar-wrap">
          <div className="budget-bar-labels">
            <span>
              Presupuesto <span className="currency-badge currency-badge-sm">{budgetCurrency}</span>
            </span>
            <span>
              {formatMoney(budgetTotal, budgetCurrency)} /{' '}
              {formatMoney(budgetLimit, budgetCurrency)}
            </span>
          </div>
          <div className="budget-bar">
            <div
              className={`budget-bar-fill ${budgetPct != null && budgetPct >= 100 ? 'over' : budgetPct != null && budgetPct >= 80 ? 'warn' : ''}`}
              style={{ width: `${budgetPct ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {isPhone && (
        <button
          type="button"
          className="btn-text spending-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Ocultar gráficos' : 'Ver análisis mensual'}
        </button>
      )}

      {expanded && (
        <div className={isPhone ? 'spending-overview-charts' : 'spending-overview-desktop'}>
          {!isEmpty && currencies.length > 1 && (
            <CurrencyTotalsPanel currencies={currencies} totals={currencyTotals} />
          )}
          {!isPhone && (
            <CategoryBarsPanel slices={slices} currency={primaryCurrency} empty={isEmpty} />
          )}
          {!isEmpty && (
            <>
              <CategoryTotalsPanel
                subscriptions={primarySubs}
                payments={primaryPayments}
                currency={primaryCurrency}
              />
              <PriceIncreasesPanel payments={primaryPayments} currency={primaryCurrency} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
