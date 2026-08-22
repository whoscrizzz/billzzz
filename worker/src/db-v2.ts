import type { SubscriptionDbRow, SubscriptionRow } from './env';
import { parseDueDates, serializeDueDates } from './due-dates-json';

/** Impide que columnas internas v2 y overrides en centavos crucen la API. */
export function subscriptionToDto(row: SubscriptionDbRow): SubscriptionRow {
  const { amount_minor: _amountMinor, ...dto } = row;
  return {
    ...dto,
    due_dates: row.due_dates
      ? serializeDueDates(parseDueDates({ due_dates: row.due_dates }))
      : null,
  };
}

export function subscriptionsToDto(
  rows: SubscriptionDbRow[] | null | undefined
): SubscriptionRow[] {
  return (rows ?? []).map(subscriptionToDto);
}
