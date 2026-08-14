import { useMemo, useState } from 'react';
import type { Subscription } from '../types/subscription';
import { groupSubscriptionsByCategory } from '../lib/category-groups';
import { categoryColor } from '../lib/categories';
import { monthlyEquivalent } from '../lib/spending-stats';
import { formatMoneyCompact as formatMoney } from '../lib/format-money';
import { SubscriptionCard } from './SubscriptionCard';

interface Props {
  subscriptions: Subscription[];
  onMarkPaid: (id: string) => void;
  onMarkPaidDetailed?: (sub: Subscription) => void;
  onEdit: (sub: Subscription) => void;
  onSnooze: (id: string, days: number) => void;
  onClearSnooze?: (id: string) => void;
  onDuplicate?: (sub: Subscription) => void;
}

/**
 * «Todos tus pagos» se organiza por categoría y por la próxima fecha dentro
 * de cada columna. Así, al registrar un pago, su nueva fecha lo reubica de
 * inmediato sin que la categoría se quede atrapada por su importe mensual.
 *
 * Arranca todo colapsado: la cabecera ya dice cuántos pagos y cuánto suma, así
 * que la pantalla informa sin desplegar nada.
 */
export function SubscriptionListGrouped({
  subscriptions,
  onMarkPaid,
  onMarkPaidDetailed,
  onEdit,
  onSnooze,
  onClearSnooze,
  onDuplicate,
}: Props) {
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set());

  const groups = useMemo(() => {
    const now = new Date();
    return groupSubscriptionsByCategory(subscriptions).map(({ category, items }) => {
      const byCurrency = new Map<string, number>();
      for (const sub of items) {
        const cur = sub.currency || 'MXN';
        const amount = monthlyEquivalent(sub, now.getFullYear(), now.getMonth());
        byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + amount);
      }
      return { category, items, totals: Array.from(byCurrency) };
    });
  }, [subscriptions]);

  if (groups.length === 0) return null;

  const toggle = (category: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <div className="category-accordion">
      {groups.map(({ category, items, totals }) => {
        const isOpen = openCategories.has(category);

        return (
          <section key={category} className="category-accordion-group">
            <h3 className="category-accordion-heading">
              <button
                type="button"
                className="category-accordion-head"
                onClick={() => toggle(category)}
                aria-expanded={isOpen}
              >
                <span
                  className="category-accordion-dot"
                  style={{ background: categoryColor(category) }}
                  aria-hidden
                />
                <span className="category-accordion-title">{category}</span>
                <span className="category-accordion-count">
                  {items.length} {items.length === 1 ? 'pago' : 'pagos'}
                </span>
                <span className="category-accordion-total">
                  {totals.map(([currency, amount]) => (
                    <span key={currency} className="category-accordion-total-line">
                      {totals.length > 1 && (
                        <span className="currency-badge currency-badge-sm">{currency}</span>
                      )}
                      {formatMoney(amount, currency)}
                    </span>
                  ))}
                </span>
                <span
                  className={`category-accordion-chevron ${
                    isOpen ? 'category-accordion-chevron-open' : ''
                  }`}
                  aria-hidden
                >
                  ›
                </span>
              </button>
            </h3>
            {isOpen && (
              <div className="category-accordion-list">
                {items.map((sub) => (
                  <SubscriptionCard
                    key={sub.id}
                    subscription={sub}
                    hideCategory
                    compact
                    onMarkPaid={onMarkPaid}
                    onMarkPaidDetailed={onMarkPaidDetailed}
                    onEdit={onEdit}
                    onSnooze={onSnooze}
                    onClearSnooze={onClearSnooze}
                    onDuplicate={onDuplicate}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
