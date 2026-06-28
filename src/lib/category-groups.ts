import type { Subscription } from "../types/subscription";
import { earliestDueDays, sortByNextDue, UNCATEGORIZED_LABEL } from "./due-dates";

export { UNCATEGORIZED_LABEL };

export interface CategoryGroup {
  category: string;
  items: Subscription[];
  rank: number;
}

function groupSortRank(category: string, items: Subscription[]): number {
  if (category === UNCATEGORIZED_LABEL) return 999_999;
  return earliestDueDays(items);
}

export function groupSubscriptionsByCategory(subscriptions: Subscription[]): CategoryGroup[] {
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
}

export function categoryAccentHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}
