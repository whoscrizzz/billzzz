import { ActionIcon } from './ActionIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PaymentRecord, Subscription } from '../types/subscription';
import { categoryColor } from '../lib/categories';
import {
  type CalendarItem,
  type CalendarItemStatus,
  computeCalendarMonth,
} from '../lib/spending-stats';
import { formatMoney } from '../lib/format-money';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const STATUS_LABEL: Record<CalendarItemStatus, string> = {
  pagado: 'Pagado',
  vencido: 'Vencido',
  hoy: 'Vence hoy',
  proximo: 'Vence pronto',
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
  const hasSoon = items.some((i) => i.status === 'hoy' || i.status === 'proximo');
  const allPaid = items.length > 0 && items.every((i) => i.status === 'pagado');
  const shown = items.slice(0, 2);
  const more = items.length - shown.length;

  const borderClass = isToday
    ? 'calendar-cell-today'
    : hasOverdue
      ? 'calendar-cell-overdue'
      : hasSoon
        ? 'calendar-cell-warn'
        : allPaid
          ? 'calendar-cell-paid'
          : '';

  const bgClass = hasOverdue
    ? 'calendar-cell-overdue-bg'
    : hasSoon
      ? 'calendar-cell-warn-bg'
      : allPaid
        ? 'calendar-cell-paid-bg'
        : '';

  return (
    <button type="button" className={`calendar-cell ${borderClass} ${bgClass}`} onClick={onOpen}>
      <span
        className={`calendar-cell-day ${isToday ? 'calendar-cell-day-today' : items.length ? '' : 'calendar-cell-day-muted'}`}
      >
        {day}
      </span>
      {shown.map((it, i) => (
        <span key={i} className="calendar-cell-item">
          <span className="calendar-item-dot" style={{ background: categoryColor(it.category) }} />
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
                  style={{ background: categoryColor(it.category) }}
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

/** Grid de mes con pagos marcados por día. Componente puro: toda la
 * navegación de mes (prev/next/hoy) la controla el llamador (ver
 * CalendarView.tsx, que es hoy el único consumidor — antes vivía embebido
 * en SpendingOverview/Inicio, se movió a la pestaña Calendario). */
export function MonthCalendar({
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
