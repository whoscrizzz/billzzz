import { addLocalDays, firstOfMonthLocal } from './local-date';
import type { QuickTemplate } from './quick-templates';
import type { LooseExpenseInput, SubscriptionInput } from '../types/subscription';

/**
 * Plantillas 'once' (Pago de crédito, Colegiatura, Pago personal): un gasto
 * ya pagado hoy, no un bill a futuro — un gasto compartido/registrado desde
 * Quick-Add nunca trae fecha propia, es de hoy. Ver createLooseExpense en
 * worker/src/subscriptions.ts y captureExpense (mismo shape que usa el
 * Atajo de Siri): subscription_id NULL, sin recordatorio ni notificación.
 */
export function buildLooseExpenseFromQuickAdd(
  template: QuickTemplate,
  name: string,
  amount: number
): LooseExpenseInput {
  return {
    name: name.trim(),
    amount,
    currency: template.currency,
    category: template.category,
  };
}

/** Solo para plantillas recurring — las 'once' van por buildLooseExpenseFromQuickAdd. */
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
    frequency: template.frequency,
    category: template.category,
    notify_days_before: template.notify_days_before,
    notify_hour: template.notify_hour,
  };

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
