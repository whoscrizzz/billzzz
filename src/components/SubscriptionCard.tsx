import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Subscription } from "../types/subscription";
import {
  daysUntilNextDue,
  formatDueLabel,
  formatDueUrgency,
  formatNextDueDate,
  FREQUENCY_LABELS,
} from "../lib/due-dates";

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

interface Props {
  subscription: Subscription;
  onDelete: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onEdit: (sub: Subscription) => void;
  onSnooze: (id: string) => void;
}

export function SubscriptionCard({
  subscription,
  onDelete,
  onMarkPaid,
  onEdit,
  onSnooze,
}: Props) {
  const hue = accentHue(subscription.category ?? subscription.name);
  const days = daysUntilNextDue(subscription);
  const urgency = formatDueUrgency(days);
  const dueLabel = formatDueLabel(subscription, days);
  const nextDate = formatNextDueDate(subscription);
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
              <p className="amount amount-sm">
                {formatMoney(subscription.amount, subscription.currency)}
              </p>
            </div>
            <div className="sub-card-meta">
              {nextDate && <span className="meta-chip meta-chip-date">{nextDate}</span>}
              <span className={`badge badge-due badge-due-${urgency} badge-sm`}>{dueLabel}</span>
              <span className="meta-chip meta-chip-muted">
                {FREQUENCY_LABELS[subscription.frequency]}
              </span>
              {subscription.category && (
                <span className="meta-chip meta-chip-muted">{subscription.category}</span>
              )}
              {subscription.snoozed_until && (
                <span className="meta-chip meta-chip-warn">Pospuesto</span>
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
          <button
            type="button"
            className="btn-icon"
            title="Posponer 3 días"
            aria-label="Posponer"
            onClick={() => onSnooze(subscription.id)}
          >
            ⏸
          </button>
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
