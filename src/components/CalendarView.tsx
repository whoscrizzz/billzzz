import { useMemo, useState } from 'react';
import { MonthCalendar } from './MonthCalendar';
import type { PaymentRecord, Subscription } from '../types/subscription';
import { computeMonthlyTotal } from '../lib/spending-stats';
import { daysUntilNextDue, nextDueIsoDate } from '../lib/due-dates';
import { formatMoney } from '../lib/format-money';

interface Props {
  subscriptions: Subscription[];
  payments: PaymentRecord[];
}

/** Pestaña "Calendario" — antes era pura configuración (CalendarSync +
 * CaptureSetup, movidos a Ajustes) sin ningún calendario visual pese al
 * nombre. MonthCalendar vivía embebido en SpendingOverview/Inicio; acá es
 * el destino final, dueño de su propia navegación de mes. */
export function CalendarView({ subscriptions, payments }: Props) {
  const [monthOffset, setMonthOffset] = useState(0);
  const isEmpty = subscriptions.length === 0;

  const monthDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const now = new Date();
  const today = now.getDate();

  const currencies = useMemo(() => {
    if (isEmpty) return ['MXN'];
    const set = new Set(subscriptions.map((s) => s.currency || 'MXN'));
    return Array.from(set).sort();
  }, [subscriptions, isEmpty]);
  const currency = currencies[0] ?? 'MXN';

  const primarySubs = useMemo(
    () => subscriptions.filter((s) => (s.currency || 'MXN') === currency),
    [subscriptions, currency]
  );
  const primaryPayments = useMemo(
    () => payments.filter((p) => (p.currency || 'MXN') === currency),
    [payments, currency]
  );
  const monthTotal = useMemo(
    () => computeMonthlyTotal(primarySubs, monthDate),
    [primarySubs, monthDate]
  );

  const upcomingByDay = useMemo(() => {
    const rows = primarySubs
      .map((sub) => {
        const days = daysUntilNextDue(sub);
        if (days == null || days < 0) return null;
        const isoDue = nextDueIsoDate(sub, new Date());
        if (!isoDue) return null;

        return {
          date: isoDue,
          days,
          sub,
        };
      })
      .filter((row): row is { date: string; days: number; sub: Subscription } => row != null)
      .sort((a, b) => a.days - b.days)
      .slice(0, 12);

    const grouped = new Map<string, { date: string; label: string; items: Subscription[] }>();

    for (const row of rows) {
      if (!grouped.has(row.date)) {
        const label = row.days === 0 ? 'Hoy' : row.days === 1 ? 'Mañana' : `En ${row.days} días`;

        grouped.set(row.date, { date: row.date, label, items: [] });
      }

      grouped.get(row.date)?.items.push(row.sub);
    }

    return Array.from(grouped.values());
  }, [primarySubs]);

  return (
    <section className="panel">
      <MonthCalendar
        subscriptions={primarySubs}
        payments={primaryPayments}
        monthDate={monthDate}
        today={today}
        currency={currency}
        monthTotal={monthTotal}
        empty={isEmpty}
        onPrev={() => setMonthOffset((m) => m - 1)}
        onNext={() => setMonthOffset((m) => m + 1)}
        onToday={() => setMonthOffset(0)}
      />

      <div className="calendar-reminders">
        <div className="calendar-reminders-head">
          <h3>Recordatorios</h3>
          <span>{upcomingByDay.length} próximos</span>
        </div>

        {upcomingByDay.length === 0 ? (
          <p className="calendar-reminders-empty">Sin pagos pendientes próximos.</p>
        ) : (
          <div className="calendar-reminder-days">
            {upcomingByDay.map((day) => (
              <div key={day.date} className="calendar-reminder-day">
                <div className="calendar-reminder-day-head">
                  <span className="calendar-reminder-day-label">{day.label}</span>
                  <span className="calendar-reminder-day-date">
                    {new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(
                      new Date(`${day.date}T12:00:00`)
                    )}
                  </span>
                </div>

                <ul className="calendar-reminder-list">
                  {day.items.map((sub) => (
                    <li key={sub.id} className="calendar-reminder-item">
                      <span className="calendar-reminder-item-name">{sub.name}</span>
                      <span className="calendar-reminder-item-amount">
                        {formatMoney(sub.amount, sub.currency || currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
