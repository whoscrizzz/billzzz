import { useMemo } from 'react';
import type { Subscription } from '../types/subscription';
import { daysUntilNextDue, formatDueLabel } from '../lib/due-dates';
import { categoryAccentHue, groupSubscriptionsByCategory } from '../lib/category-groups';
import { SubscriptionCard } from './SubscriptionCard';

interface Props {
  subscriptions: Subscription[];
  onDelete: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onMarkPaidDetailed?: (sub: Subscription) => void;
  onEdit: (sub: Subscription) => void;
  onSnooze: (id: string, days: number) => void;
  onClearSnooze?: (id: string) => void;
  onDuplicate?: (sub: Subscription) => void;
  /** En móvil: secciones apiladas; en desktop: columnas lado a lado. */
  stacked?: boolean;
}

export function SubscriptionListGrouped({
  subscriptions,
  onDelete,
  onMarkPaid,
  onMarkPaidDetailed,
  onEdit,
  onSnooze,
  onClearSnooze,
  onDuplicate,
  stacked = false,
}: Props) {
  const groups = useMemo(() => groupSubscriptionsByCategory(subscriptions), [subscriptions]);

  if (groups.length === 0) return null;

  return (
    <div
      className={`category-board ${stacked ? 'category-board-stacked' : ''}`}
      role="list"
      aria-label="Pagos por categoría"
    >
      {groups.map(({ category, items }) => {
        const earliest = items.length > 0 ? daysUntilNextDue(items[0]!) : null;
        const nextLabel =
          earliest != null && earliest <= 7 ? formatDueLabel(items[0]!, earliest) : null;
        const hue = categoryAccentHue(category);

        return (
          <section key={category} className="category-column" aria-label={category}>
            <header className="category-column-head">
              <span
                className="category-column-dot"
                style={{ background: `hsl(${hue} 55% 52%)` }}
                aria-hidden
              />
              <h3 className="category-column-title">{category}</h3>
              <span className="category-column-count">{items.length}</span>
              {nextLabel && <span className="category-column-next">{nextLabel}</span>}
            </header>
            <div className="category-column-list">
              {items.map((sub) => (
                <SubscriptionCard
                  key={sub.id}
                  subscription={sub}
                  hideCategory
                  compact
                  onDelete={onDelete}
                  onMarkPaid={onMarkPaid}
                  onMarkPaidDetailed={onMarkPaidDetailed}
                  onEdit={onEdit}
                  onSnooze={onSnooze}
                  onClearSnooze={onClearSnooze}
                  onDuplicate={onDuplicate}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
