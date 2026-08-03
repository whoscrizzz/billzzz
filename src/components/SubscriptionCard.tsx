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

const LONG_PRESS_MS = 550;

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
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressHandled = useRef(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const cardPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardPressHandled = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const clearCardPress = () => {
    if (cardPressTimer.current) {
      clearTimeout(cardPressTimer.current);
      cardPressTimer.current = null;
    }
  };

  const startCardPress = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cardPressHandled.current = false;
    clearCardPress();
    cardPressTimer.current = setTimeout(() => {
      cardPressHandled.current = true;
      setSnoozeOpen(true);
    }, LONG_PRESS_MS);
  };

  return (
    <article
      className={`card sub-card sub-card-compact${compact ? ' sub-card-column' : ''}`}
      style={{ '--card-accent': `hsl(${hue} 55% 52%)` } as CSSProperties}
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
            }, LONG_PRESS_MS);
          }}
          onTouchEnd={clearLongPress}
          onTouchCancel={clearLongPress}
        >
          <span className="reminder-check-circle" aria-hidden />
        </button>
        <button
          type="button"
          className="sub-card-tap"
          title="Editar (mantén presionado para posponer)"
          onClick={() => {
            if (cardPressHandled.current) {
              cardPressHandled.current = false;
              return;
            }
            onEdit(subscription);
          }}
          onPointerDown={startCardPress}
          onPointerUp={clearCardPress}
          onPointerLeave={clearCardPress}
          onPointerCancel={clearCardPress}
        >
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
        {onDuplicate && (
          <div className="sub-card-actions">
            <button
              type="button"
              className="btn-icon"
              title="Duplicar"
              aria-label={`Duplicar ${subscription.name}`}
              onClick={() => onDuplicate(subscription)}
            >
              <ActionIcon name="copy" />
            </button>
          </div>
        )}
      </div>
      {subscription.notes && <p className="notes notes-compact">{subscription.notes}</p>}
      <SnoozeMenu
        open={snoozeOpen}
        onOpenChange={setSnoozeOpen}
        isSnoozed={!!subscription.snoozed_until}
        onSnooze={(d) => {
          onSnooze(subscription.id, d);
          setSnoozeOpen(false);
        }}
        onClearSnooze={
          onClearSnooze
            ? () => {
                onClearSnooze(subscription.id);
                setSnoozeOpen(false);
              }
            : undefined
        }
      />
    </article>
  );
}
