import { ActionIcon } from './ActionIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { PaymentRecord, Subscription } from '../types/subscription';
import { categoryAccentHue } from '../lib/category-groups';
import {
  type CalendarItem,
  type CalendarItemStatus,
  type CategoryRange,
  computeCalendarMonth,
  computeCategorySlices,
  computeCategoryTotals,
  computeMonthComparison,
  computeMonthlyTotal,
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
            const hue = categoryAccentHue(s.category);
            const color = `hsl(${hue} 48% 44%)`;
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

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const STATUS_LABEL: Record<CalendarItemStatus, string> = {
  pagado: 'Pagado',
  vencido: 'Vencido',
  hoy: 'Vence hoy',
  pendiente: 'Por pagar',
};

/** Sin símbolo de moneda, "8.5k" arriba de 1000 — igual que el prototipo,
 * para caber en una celda de ~45px. El monto completo va en la hoja de detalle. */
function compactCalendarAmount(amount: number): string {
  if (amount >= 1000) return `${Math.round(amount / 100) / 10}k`;
  return String(Math.round(amount));
}

function CalendarDayCell({
  day,
  items,
  isToday,
  onOpen,
}: {
  day: number;
  items: CalendarItem[];
  isToday: boolean;
  onOpen: () => void;
}) {
  const hasOverdue = items.some((i) => i.status === 'vencido');
  const allPaid = items.length > 0 && items.every((i) => i.status === 'pagado');
  const shown = items.slice(0, 2);
  const more = items.length - shown.length;

  const borderClass = isToday
    ? 'calendar-cell-today'
    : hasOverdue
      ? 'calendar-cell-overdue'
      : allPaid
        ? 'calendar-cell-paid'
        : '';

  return (
    <button
      type="button"
      className={`calendar-cell ${borderClass} ${hasOverdue ? 'calendar-cell-overdue-bg' : ''}`}
      onClick={onOpen}
    >
      <span
        className={`calendar-cell-day ${isToday ? 'calendar-cell-day-today' : items.length ? '' : 'calendar-cell-day-muted'}`}
      >
        {day}
      </span>
      {shown.map((it, i) => (
        <span key={i} className="calendar-cell-item">
          <span
            className="calendar-item-dot"
            style={{ background: `hsl(${categoryAccentHue(it.category)} 48% 44%)` }}
          />
          <span className="calendar-cell-item-label">
            {it.name} {compactCalendarAmount(it.amount)}
          </span>
        </span>
      ))}
      {more > 0 && <span className="calendar-cell-more">+{more}</span>}
    </button>
  );
}

function CalendarDaySheet({
  day,
  monthLabel,
  items,
  total,
  currency,
  onClose,
}: {
  day: number;
  monthLabel: string;
  items: CalendarItem[];
  total: number;
  currency: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-card">
        <h3>
          {day} de {monthLabel}
        </h3>
        <p className="panel-hint">
          {items.length === 0 ? 'Sin pagos ese día' : `${formatMoney(total, currency)} en total`}
        </p>
        {items.length > 0 && (
          <ul className="completed-list">
            {items.map((it, i) => (
              <li key={i} className="completed-row">
                <span
                  className="category-totals-dot"
                  style={{ background: `hsl(${categoryAccentHue(it.category)} 48% 44%)` }}
                />
                <div className="completed-row-main">
                  <p className="completed-name">{it.name}</p>
                  <p className="completed-meta">
                    {it.category} · {STATUS_LABEL[it.status]}
                  </p>
                </div>
                <p className="completed-amount">{formatMoney(it.amount, currency)}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  );
}

function MonthCalendar({
  subscriptions,
  payments,
  monthDate,
  today,
  currency,
  monthTotal,
  empty,
  onPrev,
  onNext,
  onToday,
}: {
  subscriptions: Subscription[];
  payments: PaymentRecord[];
  monthDate: Date;
  today: number;
  currency: string;
  monthTotal: number;
  empty?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const { year, month, monthLabel, itemsByDay } = useMemo(
    () => computeCalendarMonth(subscriptions, payments, monthDate),
    [subscriptions, payments, monthDate]
  );

  const weeks = useMemo(() => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const leadBlanks = (new Date(year, month, 1).getDay() + 6) % 7;
    const cells: (number | null)[] = Array.from({ length: leadBlanks }, () => null);
    for (let d = 1; d <= lastDay; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [year, month]);

  const selectedItems = selectedDay != null ? (itemsByDay.get(selectedDay) ?? []) : [];
  const selectedTotal = selectedItems.reduce((sum, i) => sum + i.amount, 0);

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
        <>
          <div className="calendar-today-row">
            <button type="button" className="btn-text calendar-today-btn" onClick={onToday}>
              Hoy
            </button>
          </div>
          <div
            className="calendar-grid"
            role="img"
            aria-label={`Calendario de pagos de ${monthLabel}`}
          >
            <div className="calendar-grid-row calendar-grid-weekdays">
              {WEEKDAY_LABELS.map((w, i) => (
                <span key={i} className="calendar-weekday">
                  {w}
                </span>
              ))}
              <span className="calendar-week-total-label">SEM</span>
            </div>
            {weeks.map((week, wi) => {
              const weekTotal = week.reduce<number>((sum, d) => {
                if (d == null) return sum;
                const items = itemsByDay.get(d) ?? [];
                return sum + items.reduce((s, i) => s + i.amount, 0);
              }, 0);
              return (
                <div className="calendar-grid-row" key={wi}>
                  {week.map((d, di) =>
                    d == null ? (
                      <span key={di} className="calendar-cell calendar-cell-empty" />
                    ) : (
                      <CalendarDayCell
                        key={di}
                        day={d}
                        items={itemsByDay.get(d) ?? []}
                        isToday={d === today}
                        onOpen={() => setSelectedDay(d)}
                      />
                    )
                  )}
                  <span className="calendar-week-total">{formatMoney(weekTotal, currency)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {selectedDay != null && (
        <CalendarDaySheet
          day={selectedDay}
          monthLabel={monthLabel}
          items={selectedItems}
          total={selectedTotal}
          currency={currency}
          onClose={() => setSelectedDay(null)}
        />
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

function MonthComparisonPanel({
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
            const hue = categoryAccentHue(t.category);
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
                    style={{ background: `hsl(${hue} 48% 44%)` }}
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
                  <div className="category-totals-bar-fill" style={{ width: `${t.pct}%` }} />
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
  const [monthOffset, setMonthOffset] = useState(0);
  const [expanded, setExpanded] = useState(defaultExpanded || (hideCurrencySummary && !isPhone));
  const isEmpty = subscriptions.length === 0;

  const ref = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const currencies = useMemo(() => {
    if (isEmpty) return ['MXN'];
    const set = new Set(subscriptions.map((s) => s.currency || 'MXN'));
    return Array.from(set).sort();
  }, [subscriptions, isEmpty]);

  const currencyTotals = useMemo(
    () => computeTotalsByCurrency(subscriptions, ref),
    [subscriptions, ref]
  );

  const now = new Date();
  const isCurrentMonth =
    ref.getFullYear() === now.getFullYear() && ref.getMonth() === now.getMonth();
  const today = isCurrentMonth ? now.getDate() : -1;

  const primaryCurrency = currencies[0] ?? 'MXN';
  const primarySubs = subscriptions.filter((s) => (s.currency || 'MXN') === primaryCurrency);
  const primaryPayments = payments.filter((p) => (p.currency || 'MXN') === primaryCurrency);
  const slices = computeCategorySlices(primarySubs, ref);
  const total = computeMonthlyTotal(primarySubs, ref);

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

      <button
        type="button"
        className="btn-text spending-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? 'Ocultar gráficos' : 'Ver análisis mensual'}
      </button>

      {expanded && (
        <div className={isPhone ? 'spending-overview-charts' : 'spending-overview-desktop'}>
          {isPhone ? (
            <>
              <MonthCalendar
                subscriptions={primarySubs}
                payments={primaryPayments}
                monthDate={ref}
                today={today}
                currency={primaryCurrency}
                monthTotal={total}
                empty={isEmpty}
                onPrev={() => setMonthOffset((m) => m - 1)}
                onNext={() => setMonthOffset((m) => m + 1)}
                onToday={() => setMonthOffset(0)}
              />
              {!isEmpty && currencies.length > 1 && (
                <CurrencyTotalsPanel currencies={currencies} totals={currencyTotals} />
              )}
            </>
          ) : (
            <div className="spending-overview-desktop-grid">
              <div className="spending-overview-desktop-main">
                <MonthCalendar
                  subscriptions={primarySubs}
                  payments={primaryPayments}
                  monthDate={ref}
                  today={today}
                  currency={primaryCurrency}
                  monthTotal={total}
                  empty={isEmpty}
                  onPrev={() => setMonthOffset((m) => m - 1)}
                  onNext={() => setMonthOffset((m) => m + 1)}
                  onToday={() => setMonthOffset(0)}
                />
                {!isEmpty && currencies.length > 1 && (
                  <CurrencyTotalsPanel currencies={currencies} totals={currencyTotals} />
                )}
              </div>
              <div className="spending-overview-desktop-side">
                <CategoryBarsPanel slices={slices} currency={primaryCurrency} empty={isEmpty} />
              </div>
            </div>
          )}
          {!isEmpty && (
            <>
              <CategoryTotalsPanel
                subscriptions={primarySubs}
                payments={primaryPayments}
                currency={primaryCurrency}
              />
              <PriceIncreasesPanel payments={primaryPayments} currency={primaryCurrency} />
              <MonthComparisonPanel payments={primaryPayments} currency={primaryCurrency} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
