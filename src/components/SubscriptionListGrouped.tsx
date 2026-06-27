import { useMemo } from "react";
import type { Subscription } from "../types/subscription";
import { sortByNextDue } from "../lib/due-dates";
import { SubscriptionCard } from "./SubscriptionCard";

interface Props {
  subscriptions: Subscription[];
  onDelete: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onEdit: (sub: Subscription) => void;
  onSnooze: (id: string, days: number) => void;
  onClearSnooze?: (id: string) => void;
  onDuplicate?: (sub: Subscription) => void;
}

export function SubscriptionListGrouped({
  subscriptions,
  onDelete,
  onMarkPaid,
  onEdit,
  onSnooze,
  onClearSnooze,
  onDuplicate,
}: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, Subscription[]>();
    for (const sub of subscriptions) {
      const cat = sub.category?.trim() || "Sin categoría";
      const list = map.get(cat) ?? [];
      list.push(sub);
      map.set(cat, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([category, items]) => ({
        category,
        items: [...items].sort(sortByNextDue),
      }));
  }, [subscriptions]);

  return (
    <div className="grouped-list">
      {groups.map(({ category, items }) => (
        <section key={category} className="grouped-section">
          <header className="grouped-section-head">
            <h3 className="grouped-section-title">{category}</h3>
            <span className="grouped-section-count">{items.length}</span>
          </header>
          <div className="grouped-section-items">
            {items.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                subscription={sub}
                hideCategory
                onDelete={onDelete}
                onMarkPaid={onMarkPaid}
                onEdit={onEdit}
                onSnooze={onSnooze}
                onClearSnooze={onClearSnooze}
                onDuplicate={onDuplicate}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
