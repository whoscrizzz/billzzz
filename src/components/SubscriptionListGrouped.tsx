import { useCallback, useMemo, useState } from "react";
import type { Subscription } from "../types/subscription";
import {
  daysUntilNextDue,
  earliestDueDays,
  formatDueLabel,
  sortByNextDue,
  UNCATEGORIZED_LABEL,
} from "../lib/due-dates";
import { loadCategoryOpenState, saveCategoryOpenState } from "../lib/ui-prefs";
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

function accentHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function groupSortRank(category: string, items: Subscription[]): number {
  if (category === UNCATEGORIZED_LABEL) return 999_999;
  return earliestDueDays(items);
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
  const [openState, setOpenState] = useState(loadCategoryOpenState);

  const groups = useMemo(() => {
    const map = new Map<string, Subscription[]>();
    for (const sub of subscriptions) {
      const cat = sub.category?.trim() || UNCATEGORIZED_LABEL;
      const list = map.get(cat) ?? [];
      list.push(sub);
      map.set(cat, list);
    }
    return Array.from(map.entries())
      .map(([category, items]) => ({
        category,
        items: [...items].sort(sortByNextDue),
        rank: groupSortRank(category, items),
      }))
      .sort((a, b) => a.rank - b.rank || a.category.localeCompare(b.category, "es"));
  }, [subscriptions]);

  const toggleGroup = useCallback(
    (category: string, open: boolean) => {
      setOpenState((prev) => {
        const next = { ...prev, [category]: open };
        saveCategoryOpenState(next);
        return next;
      });
    },
    [],
  );

  return (
    <div className="grouped-list grouped-list-reminders">
      {groups.map(({ category, items }) => {
        const earliest = earliestDueDays(items);
        const nextLabel =
          earliest <= 7 ? formatDueLabel(items[0]!, daysUntilNextDue(items[0]!)) : null;
        const isOpen = openState[category] ?? earliest <= 7;
        const hue = accentHue(category);

        return (
          <details
            key={category}
            className="grouped-panel"
            open={isOpen}
            onToggle={(e) => toggleGroup(category, (e.target as HTMLDetailsElement).open)}
          >
            <summary className="grouped-panel-summary">
              <span
                className="grouped-panel-dot"
                style={{ background: `hsl(${hue} 55% 52%)` }}
                aria-hidden
              />
              <span className="grouped-panel-title">{category}</span>
              <span className="grouped-section-count">{items.length}</span>
              {nextLabel && <span className="grouped-panel-next">{nextLabel}</span>}
            </summary>
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
          </details>
        );
      })}
    </div>
  );
}
