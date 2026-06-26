import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Subscription } from "../types/subscription";
import { parseDueDates } from "../lib/due-dates-json";
import {
  daysUntilNextDue,
  formatDueLabel,
  formatDueUrgency,
  formatNextDueDate,
  FREQUENCY_LABELS,
} from "../lib/due-dates";
import { SnoozeMenu } from "./SnoozeMenu";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function accentHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function formatSnoozeUntil(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(date);
}

interface Props {
  subscription: Subscription;
  onDelete: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onEdit: (sub: Subscription) => void;
  onSnooze: (id: string, days: number) => void;
  onClearSnooze?: (id: string) => void;
  onDuplicate?: (sub: Subscription) => void;
}

export function SubscriptionCard({
  subscription,
  onDelete,
  onMarkPaid,
  onEdit,
  onSnooze,
  onClearSnooze,
  onDuplicate,
}: Props) {
  const hue = accentHue(subscription.category ?? subscription.name);
  const days = daysUntilNextDue(subscription);
  const urgency = formatDueUrgency(days);
  const dueLabel = formatDueLabel(subscription, days);
  const nextDate = formatNextDueDate(subscription);
  const multiCount = subscription.due_dates ? parseDueDates(subscription).length : 0;
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0]?.clientX ?? 0;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const x = e.touches[0]?.clientX ?? 0;
    setOffsetX(Math.max(-80, Math.min(80, x - startX.current)));
  };

  const onTouchEnd = () => {
    if (offsetX > 60) onMarkPaid(subscription.id);
    else if (offsetX < -60) onDelete(subscription.id);
    setOffsetX(0);
  };

  return (
    <article
      className="card sub-card sub-card-compact sub-card-swipe"
      style={
        {
          "--card-accent": `hsl(${hue} 55% 52%)`,
          transform: `translateX(${offsetX}px)`,
        } as CSSProperties
      }
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="sub-card-row">
        <button type="button" className="sub-card-tap" onClick={() => onEdit(subscription)}>
          <div className="sub-card-main">
            <div className="sub-card-top">
              <h3>{subscription.name}</h3>
              <p className="amount amount-sm amount-with-currency">
                <span className="currency-badge">{subscription.currency}</span>
                {formatMoney(subscription.amount, subscription.currency)}
              </p>
            </div>
            <div className="sub-card-meta">
              {nextDate && <span className="meta-chip meta-chip-date">{nextDate}</span>}
              {multiCount > 1 && (
                <span className="meta-chip meta-chip-muted">{multiCount} fechas</span>
              )}
              <span className={`badge badge-due badge-due-${urgency} badge-sm`}>{dueLabel}</span>
              <span className="meta-chip meta-chip-muted">
                {FREQUENCY_LABELS[subscription.frequency]}
              </span>
              {subscription.category && (
                <span className="meta-chip meta-chip-muted">{subscription.category}</span>
              )}
              {subscription.snoozed_until && (
                <span className="meta-chip meta-chip-warn">
                  Posponido hasta {formatSnoozeUntil(subscription.snoozed_until)}
                </span>
              )}
            </div>
          </div>
        </button>
        <div className="sub-card-actions">
          <button
            type="button"
            className="btn-icon btn-icon-ok"
            title="Marcar pagado"
            aria-label="Marcar pagado"
            onClick={() => onMarkPaid(subscription.id)}
          >
            ✓
          </button>
          <SnoozeMenu
            isSnoozed={!!subscription.snoozed_until}
            onSnooze={(d) => onSnooze(subscription.id, d)}
            onClearSnooze={onClearSnooze ? () => onClearSnooze(subscription.id) : undefined}
          />
          {onDuplicate && (
            <button
              type="button"
              className="btn-icon"
              title="Duplicar"
              aria-label="Duplicar"
              onClick={() => onDuplicate(subscription)}
            >
              ⧉
            </button>
          )}
          <button
            type="button"
            className="btn-icon btn-icon-del"
            title="Eliminar"
            aria-label="Eliminar"
            onClick={() => onDelete(subscription.id)}
          >
            ×
          </button>
        </div>
      </div>
      {subscription.notes && <p className="notes notes-compact">{subscription.notes}</p>}
    </article>
  );
}
