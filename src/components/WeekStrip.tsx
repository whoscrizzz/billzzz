import type { Subscription } from "../types/subscription";
import { daysUntilNextDue, formatNextDueDate } from "../lib/due-dates";

interface Props {
  subscriptions: Subscription[];
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, notation: "compact" }).format(
    amount,
  );
}

export function WeekStrip({ subscriptions }: Props) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });

  const itemsByDay = days.map((day) => {
    const due = subscriptions.filter((s) => {
      const daysLeft = daysUntilNextDue(s, day);
      return daysLeft === 0;
    });
    return { day, due };
  });

  const hasAny = itemsByDay.some((x) => x.due.length > 0);
  if (!hasAny) return null;

  return (
    <section className="week-strip" aria-label="Pagos esta semana">
      <p className="week-strip-title">Esta semana</p>
      <div className="week-strip-row">
        {itemsByDay.map(({ day, due }) => {
          const label = new Intl.DateTimeFormat("es-MX", {
            weekday: "short",
            day: "numeric",
            timeZone: "UTC",
          }).format(day);
          const isToday = day.toDateString() === today.toDateString();
          return (
            <div key={day.toISOString()} className={`week-day ${isToday ? "week-day-today" : ""}`}>
              <span className="week-day-label">{label}</span>
              {due.length === 0 ? (
                <span className="week-day-empty">—</span>
              ) : (
                <ul className="week-day-list">
                  {due.slice(0, 2).map((s) => (
                    <li key={s.id} title={formatNextDueDate(s, day) ?? ""}>
                      <span className="week-day-name">{s.name}</span>
                      <span className="week-day-amt">{formatMoney(s.amount, s.currency)}</span>
                    </li>
                  ))}
                  {due.length > 2 && <li className="week-day-more">+{due.length - 2}</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
