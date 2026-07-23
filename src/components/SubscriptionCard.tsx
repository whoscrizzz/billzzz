import { ActionIcon } from './ActionIcon';
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Subscription } from '../types/subscription';
import { parseDueDates } from '../lib/due-dates-json';
import {
  daysUntilNextDue,
  formatDueLabel,
  formatDueUrgency,
  formatNextDueDate,
  FREQUENCY_LABELS,
} from '../lib/due-dates';
import { SnoozeMenu } from './SnoozeMenu';

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
}

function accentHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function formatSnoozeUntil(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(date);
}

interface Props {
  subscription: Subscription;
  onDelete: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onMarkPaidDetailed?: (sub: Subscription) => void;
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
  onMarkPaidDetailed,
  onEdit,
  onSnooze,
  onClearSnooze,
  onDuplicate,
  hideCategory = false,
  compact = false,
}: Props) {
  const hue = accentHue(subscription.category ?? subscription.name);
  const days = daysUntilNextDue(subscription);
  const urgency = formatDueUrgency(days);
  const dueLabel = formatDueLabel(subscription, days);
  const nextDate = formatNextDueDate(subscription);
  const multiCount = subscription.due_dates ? parseDueDates(subscription).length : 0;
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const swipeActive = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressHandled = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0]?.clientX ?? 0;
    startY.current = e.touches[0]?.clientY ?? 0;
    swipeActive.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const x = e.touches[0]?.clientX ?? 0;
    const y = e.touches[0]?.clientY ?? 0;
    const dx = x - startX.current;
    const dy = y - startY.current;
    if (!swipeActive.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) return;
      swipeActive.current = true;
    }
    setOffsetX(Math.max(-80, Math.min(80, dx)));
  };

  const onTouchEnd = () => {
    if (!swipeActive.current) {
      setOffsetX(0);
      return;
    }
    if (offsetX > 60) onMarkPaid(subscription.id);
    else if (offsetX < -60) onDelete(subscription.id);
    setOffsetX(0);
  };

  return (
    <article
      className={`card sub-card sub-card-compact sub-card-swipe${compact ? ' sub-card-column' : ''}`}
      style={
        {
          '--card-accent': `hsl(${hue} 55% 52%)`,
          transform: `translateX(${offsetX}px)`,
          transition: offsetX !== 0 ? 'none' : 'transform 0.3s ease',
          background:
            offsetX > 20
              ? `linear-gradient(90deg, rgba(5,150,105,0.15) 0%, transparent 60%)`
              : offsetX < -20
                ? `linear-gradient(270deg, rgba(220,38,38,0.12) 0%, transparent 60%)`
                : undefined,
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
          title="Marcar pagado (mantén para monto/fecha)"
          aria-label={`Marcar ${subscription.name} como pagado`}
          onClick={() => {
            if (longPressHandled.current) {
              longPressHandled.current = false;
              return;
            }
            onMarkPaid(subscription.id);
          }}
          onTouchStart={() => {
            if (!onMarkPaidDetailed) return;
            longPressHandled.current = false;
            clearLongPress();
            longPressTimer.current = setTimeout(() => {
              longPressHandled.current = true;
              onMarkPaidDetailed(subscription);
            }, 550);
          }}
          onTouchEnd={clearLongPress}
          onTouchCancel={clearLongPress}
        >
          <span className="reminder-check-circle" aria-hidden />
        </button>
        <button type="button" className="sub-card-tap" onClick={() => onEdit(subscription)}>
          <div className="sub-card-main">
            <div className="sub-card-top">
              <span className="sub-card-title-wrap">
                <span
                  className="sub-card-dot"
                  style={{ background: `hsl(${hue} 52% 48%)` }}
                  aria-hidden
                />
                <h3>{subscription.name}</h3>
              </span>
              <p className="amount amount-sm">
                {formatMoney(subscription.amount, subscription.currency)}
              </p>
            </div>
            <div className="sub-card-chips">
              {dueLabel && (
                <span
                  className={`sub-chip sub-chip-${urgency === 'past' ? 'overdue' : urgency === 'today' ? 'today' : urgency === 'soon' ? 'soon' : 'muted'}`}
                >
                  {dueLabel}
                </span>
              )}
              {nextDate && <span className="sub-chip sub-chip-muted">{nextDate}</span>}
              {multiCount > 1 && (
                <span className="sub-chip sub-chip-muted">{multiCount} fechas</span>
              )}
              <span className="sub-chip sub-chip-muted">
                {FREQUENCY_LABELS[subscription.frequency]}
              </span>
              {!hideCategory && subscription.category && (
                <span className="sub-chip">{subscription.category}</span>
              )}
              {subscription.snoozed_until && (
                <span className="sub-chip sub-chip-snooze">
                  Posponido {formatSnoozeUntil(subscription.snoozed_until)}
                </span>
              )}
            </div>
          </div>
        </button>
        <div className="sub-card-actions">
          {onDuplicate && (
            <button
              type="button"
              className="btn-icon"
              title="Duplicar"
              aria-label={`Duplicar ${subscription.name}`}
              onClick={() => onDuplicate(subscription)}
            >
              <ActionIcon name="copy" />
            </button>
          )}
          <SnoozeMenu
            isSnoozed={!!subscription.snoozed_until}
            onSnooze={(d) => onSnooze(subscription.id, d)}
            onClearSnooze={onClearSnooze ? () => onClearSnooze(subscription.id) : undefined}
          />
          <button
            type="button"
            className="btn-icon btn-icon-del"
            title="Eliminar"
            aria-label={`Eliminar ${subscription.name}`}
            onClick={() => onDelete(subscription.id)}
          >
            <ActionIcon name="trash" />
          </button>
        </div>
      </div>
      {subscription.notes && <p className="notes notes-compact">{subscription.notes}</p>}
    </article>
  );
}
