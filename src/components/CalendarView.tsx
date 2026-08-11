import { useMemo, useState } from 'react';
import { MonthCalendar } from './MonthCalendar';
import type { PaymentRecord, Subscription } from '../types/subscription';
import { computeMonthlyTotal } from '../lib/spending-stats';

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
  const isCurrentMonth =
    monthDate.getFullYear() === now.getFullYear() && monthDate.getMonth() === now.getMonth();
  const today = isCurrentMonth ? now.getDate() : -1;

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
    </section>
  );
}
