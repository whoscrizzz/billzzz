export type Frequency = 'weekly' | 'monthly' | 'yearly' | 'once';

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
  category: string | null;
  notes: string | null;
  notify_days_before: number;
  notify_hour: number;
  snoozed_until: string | null;
  deleted_at: string | null;
  last_paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionInput {
  name: string;
  amount: number;
  currency?: string;
  due_day?: number;
  due_date?: string;
  due_dates?: string[];
  frequency: Frequency;
  category?: string;
  notes?: string;
  notify_days_before?: number;
  notify_hour?: number;
  snoozed_until?: string | null;
}

export interface PaymentRecord {
  id: string;
  subscription_id: string;
  amount: number;
  currency: string;
  paid_at: string;
  notes: string | null;
  subscription_name: string | null;
  subscription_deleted_at?: string | null;
}

export type BillFilter = 'all' | 'recurring' | 'once' | 'due-soon';

export type SortMode = 'due' | 'amount-desc' | 'amount-asc' | 'name';

export type ListLayout = 'flat' | 'category';

export interface UserSettings {
  budget_limit: number | null;
  email_reminders: boolean;
  email: string | null;
  timezone: string;
  active_sessions: number;
}

export interface MarkPaidInput {
  amount?: number;
  notes?: string;
  paid_at?: string;
}
