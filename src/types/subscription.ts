export type Frequency = 'weekly' | 'monthly' | 'yearly' | 'once' | 'interval';

/** Unidad del intervalo para frequency 'interval' (p. ej. cada 15 'day'). */
export type IntervalUnit = 'day' | 'week' | 'month';

/** Una fecha personalizada ("Varias fechas") con monto opcional distinto al de la suscripción. */
export interface DueDateEntry {
  date: string;
  amount?: number;
}

export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  due_day: number;
  frequency: Frequency;
  due_date: string | null;
  due_dates: string | null;
  /** Patrón perpetuo de varios días del mes (p. ej. [1, 15]) — JSON crudo, ver due-dates-json.ts. */
  due_days: string | null;
  interval_count: number | null;
  interval_unit: IntervalUnit | null;
  category: string | null;
  notes: string | null;
  notify_days_before: number;
  notify_hour: number;
  snoozed_until: string | null;
  deleted_at: string | null;
  trashed_at: string | null;
  last_paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionInput {
  /** Id generado por el cliente para que el create sea idempotente — ver
   * createSubscription en worker/src/subscriptions.ts. Opcional: updateSubscription
   * reusa este mismo tipo (Partial<SubscriptionInput>) y ahí no aplica. */
  id?: string;
  name: string;
  amount: number;
  currency?: string;
  due_day?: number;
  due_date?: string;
  due_dates?: DueDateEntry[];
  due_days?: number[];
  interval_count?: number | null;
  interval_unit?: IntervalUnit | null;
  frequency: Frequency;
  category?: string;
  notes?: string;
  notify_days_before?: number;
  notify_hour?: number;
  snoozed_until?: string | null;
}

export interface PaymentRecord {
  id: string;
  /** null en un gasto suelto capturado desde Atajos (Fase 7b) — ese pago no
   *  cuelga de ninguna suscripción y trae su propio nombre/categoría. */
  subscription_id: string | null;
  amount: number;
  currency: string;
  paid_at: string;
  notes: string | null;
  subscription_name: string | null;
  category?: string | null;
  subscription_deleted_at?: string | null;
}

export type BillFilter = 'all' | 'recurring' | 'once' | 'due-soon';

export type SortMode = 'due' | 'amount-desc' | 'amount-asc' | 'name';

export type ListLayout = 'flat' | 'category';

export interface UserSettings {
  budget_limit: number | null;
  email_reminders: boolean;
  email: string | null;
  display_name: string | null;
  timezone: string;
  active_sessions: number;
}

export interface MarkPaidInput {
  amount?: number;
  notes?: string;
  paid_at?: string;
}
