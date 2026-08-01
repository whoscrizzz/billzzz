import { ActionIcon } from './ActionIcon';
import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { Subscription } from '../types/subscription';
import { parseDueDates } from '../lib/due-dates-json';
import {
  daysUntilNextDue,
  formatDueLabel,
  formatDueUrgency,
  formatNextDueDate,
  FREQUENCY_LABELS,
} from '../lib/due-dates';
import { formatMoney } from '../lib/format-money';
import { SnoozeMenu } from './SnoozeMenu';
import { armClickSuppression } from '../lib/swipe-click-guard';

const SWIPE_DEADZONE = 8;
const SWIPE_REVERSAL_MARGIN = 16;
const SWIPE_MIN_THRESHOLD = 96;
const SWIPE_THRESHOLD_RATIO = 0.45;
const SWIPE_RESISTANCE = 0.4;
const SWIPE_LABEL_RATIO = 0.4;

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
  const cardRef = useRef<HTMLElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const rawDx = useRef(0);
  const direction = useRef<'undecided' | 'horizontal' | 'vertical'>('undecided');
  const reachedHorizontal = useRef(false);
  const threshold = useRef(SWIPE_MIN_THRESHOLD);
  const pointerId = useRef<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressHandled = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const resetSwipe = () => {
    direction.current = 'undecided';
    setOffsetX(0);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    rawDx.current = 0;
    direction.current = 'undecided';
    reachedHorizontal.current = false;
    pointerId.current = e.pointerId;
    const width = cardRef.current?.getBoundingClientRect().width ?? 0;
    threshold.current = Math.max(SWIPE_MIN_THRESHOLD, width * SWIPE_THRESHOLD_RATIO);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (pointerId.current !== e.pointerId) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (direction.current === 'undecided') {
      if (Math.abs(dx) < SWIPE_DEADZONE && Math.abs(dy) < SWIPE_DEADZONE) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        direction.current = 'vertical';
        return;
      }
      direction.current = 'horizontal';
      reachedHorizontal.current = true;
      cardRef.current?.setPointerCapture(e.pointerId);
    } else if (direction.current === 'vertical') {
      return;
    } else if (Math.abs(dy) > Math.abs(dx) + SWIPE_REVERSAL_MARGIN) {
      // El gesto derivó a scroll vertical a mitad de camino — soltar y no borrar el intento.
      direction.current = 'vertical';
      if (cardRef.current?.hasPointerCapture(e.pointerId)) {
        cardRef.current.releasePointerCapture(e.pointerId);
      }
      resetSwipe();
      return;
    }

    e.preventDefault();
    rawDx.current = dx;
    const magnitude = Math.abs(dx);
    const t = threshold.current;
    const display =
      magnitude <= t ? magnitude : Math.min(t * 1.8, t + (magnitude - t) * SWIPE_RESISTANCE);
    setOffsetX(Math.sign(dx) * display);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (pointerId.current !== e.pointerId) return;
    if (cardRef.current?.hasPointerCapture(e.pointerId)) {
      cardRef.current.releasePointerCapture(e.pointerId);
    }
    pointerId.current = null;

    if (reachedHorizontal.current) {
      armClickSuppression();
    }
    if (direction.current === 'horizontal') {
      const dx = rawDx.current;
      const t = threshold.current;
      if (dx >= t) onMarkPaid(subscription.id);
      else if (dx <= -t) onSnooze(subscription.id, 3);
    }
    resetSwipe();
  };

  const onPointerCancel = () => {
    pointerId.current = null;
    resetSwipe();
  };

  const swipeMagnitude = Math.abs(offsetX);
  const swipeProgress = Math.min(1, swipeMagnitude / threshold.current);
  const swipeLabel =
    swipeProgress >= SWIPE_LABEL_RATIO
      ? swipeProgress >= 1
        ? offsetX > 0
          ? 'Marcar pagado'
          : 'Posponer 3 días'
        : 'Desliza más'
      : null;

  return (
    <article
      ref={cardRef}
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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {swipeLabel && (
        <span
          className={`sub-card-swipe-label ${offsetX > 0 ? 'sub-card-swipe-label-right' : 'sub-card-swipe-label-left'}`}
        >
          {swipeLabel}
        </span>
      )}
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
        </div>
      </div>
      {subscription.notes && <p className="notes notes-compact">{subscription.notes}</p>}
    </article>
  );
}
