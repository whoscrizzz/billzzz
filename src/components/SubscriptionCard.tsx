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

function urgencyClass(urgency: ReturnType<typeof formatDueUrgency>): string {
  switch (urgency) {
    case "today":
      return "meta-urgency-urgent";
    case "past":
      return "meta-urgency-overdue";
    case "soon":
      return "meta-urgency-calm";
    case "normal":
    case "none":
      return "";
    default: {
      const _exhaustive: never = urgency;
      return _exhaustive;
    }
  }
}

interface Props {
  subscription: Subscription;
  onDelete: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onEdit: (sub: Subscription) => void;
  onSnooze: (id: string, days: number) => void;
  onClearSnooze?: (id: string) => void;
  onDuplicate?: (sub: Subscription) => void;
  /** Oculta categoría cuando la lista ya está agrupada por categoría. */
  hideCategory?: boolean;
  /** Tarjeta más compacta dentro de columnas de categoría. */
  compact?: boolean;
}

export function SubscriptionCard({
  subscription,
  onDelete,
  onMarkPaid,
  onEdit,
  onSnooze,
  onClearSnooze,
  onDuplicate: _onDuplicate,
  hideCategory = false,
  compact = false,
}: Props) {
  void _onDuplicate;
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
      className={`card sub-card sub-card-compact sub-card-swipe${compact ? " sub-card-column" : ""}`}
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
      <div className="sub-card-row sub-card-row-reminders">
        <button
          type="button"
          className="reminder-check"
          title="Marcar pagado"
          aria-label={`Marcar ${subscription.name} como pagado`}
          onClick={() => onMarkPaid(subscription.id)}
        >
          <span className="reminder-check-circle" aria-hidden />
        </button>
        <button type="button" className="sub-card-tap" onClick={() => onEdit(subscription)}>
          <div className="sub-card-main">
            <div className="sub-card-top">
              <h3>{subscription.name}</h3>
              <p className="amount amount-sm">
                {formatMoney(subscription.amount, subscription.currency)}
              </p>
            </div>
            <p className="sub-card-meta-line">
              {nextDate && <span>{nextDate}</span>}
              {multiCount > 1 && (
                <>
                  {nextDate && <span className="meta-sep">·</span>}
                  <span>{multiCount} fechas</span>
                </>
              )}
              {dueLabel && (
                <>
                  {(nextDate || multiCount > 1) && <span className="meta-sep">·</span>}
                  <span className={`meta-urgency ${urgencyClass(urgency)}`}>{dueLabel}</span>
                </>
              )}
              <span className="meta-sep">·</span>
              <span>{FREQUENCY_LABELS[subscription.frequency]}</span>
              {!hideCategory && subscription.category && (
                <>
                  <span className="meta-sep">·</span>
                  <span>{subscription.category}</span>
                </>
              )}
              {subscription.snoozed_until && (
                <>
                  <span className="meta-sep">·</span>
                  <span className="meta-urgency meta-urgency-urgent">
                    Posponido {formatSnoozeUntil(subscription.snoozed_until)}
                  </span>
                </>
              )}
            </p>
          </div>
        </button>
        <div className="sub-card-actions">
          <SnoozeMenu
            isSnoozed={!!subscription.snoozed_until}
            onSnooze={(d) => onSnooze(subscription.id, d)}
            onClearSnooze={onClearSnooze ? () => onClearSnooze(subscription.id) : undefined}
          />
        </div>
      </div>
      {subscription.notes && <p className="notes notes-compact">{subscription.notes}</p>}
    </article>
  );
}
