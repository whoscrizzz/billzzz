import { addLocalDays, firstOfMonthLocal } from './local-date';
import type { QuickTemplate } from './quick-templates';
import type { SubscriptionInput } from '../types/subscription';

export function buildSubscriptionFromQuickAdd(
  template: QuickTemplate,
  name: string,
  amount: number
): SubscriptionInput {
  const trimmed = name.trim();
  const input: SubscriptionInput = {
    name: trimmed,
    amount,
    currency: template.currency,
    frequency: template.kind === 'once' ? 'once' : template.frequency,
    category: template.category,
    notify_days_before: template.notify_days_before,
    notify_hour: template.notify_hour,
  };

  if (template.kind === 'once') {
    input.due_date = addLocalDays(7);
    return input;
  }

  if (template.frequency === 'weekly' && template.weekday) {
    input.due_day = template.weekday;
    return input;
  }

  if (template.frequency === 'monthly') {
    input.due_date = firstOfMonthLocal();
    return input;
  }

  input.due_date = addLocalDays(template.frequency === 'yearly' ? 30 : 7);
  return input;
}
