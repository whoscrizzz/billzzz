import type { Frequency, Subscription } from '../types/subscription';
import { localIsoDate } from './local-date';
import {
  nearestDueFromList,
  parseDueDates,
  removeDueDate,
  serializeDueDates,
} from './due-dates-json';

type DueFields = Pick<
  Subscription,
  'frequency' | 'due_day' | 'due_date' | 'due_dates' | 'created_at' | 'snoozed_until'
>;

/** Calendar-day timestamp in the user's local timezone (midnight local as UTC ms). */
function todayCalendarTs(from = new Date()): number {
  return Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
}

function nextMonthlyDueTs(sub: DueFields, todayTs: number, from: Date): number {
  const anchor = resolveAnchorDay(sub);

  if (sub.due_date) {
    const storedTs = parseIsoDateUtc(sub.due_date);
    if (storedTs != null) {
      if (storedTs >= todayTs) return storedTs;
      let y = Number(sub.due_date.slice(0, 4));
      let m = Number(sub.due_date.slice(5, 7)) - 1;
      let due = safeUtcDate(y, m, anchor);
      while (due < todayTs) {
        m += 1;
        if (m > 11) {
          m = 0;
          y += 1;
        }
        due = safeUtcDate(y, m, anchor);
      }
      return due;
    }
  }

  const year = from.getFullYear();
  const month = from.getMonth();
  let due = safeUtcDate(year, month, anchor);
  if (due < todayTs) due = safeUtcDate(year, month + 1, anchor);
  return due;
}

function nextYearlyDueTs(sub: DueFields, todayTs: number, from: Date): number {
  const { month, day } = resolveYearlyAnchor(sub);

  if (sub.due_date) {
    const storedTs = parseIsoDateUtc(sub.due_date);
    if (storedTs != null) {
      if (storedTs >= todayTs) return storedTs;
      let y = Number(sub.due_date.slice(0, 4)) + 1;
      let due = safeUtcDate(y, month, day);
      while (due < todayTs) {
        y += 1;
        due = safeUtcDate(y, month, day);
      }
      return due;
    }
  }

  const year = from.getFullYear();
  let due = safeUtcDate(year, month, day);
  if (due < todayTs) due = safeUtcDate(year + 1, month, day);
  return due;
}

export function daysUntilNextDue(sub: DueFields, from = new Date()): number | null {
  if (sub.snoozed_until) {
    const snoozeEnd = parseIsoDateUtc(sub.snoozed_until);
    const todayTs = todayCalendarTs(from);
    if (snoozeEnd != null && snoozeEnd > todayTs) {
      return Math.round((snoozeEnd - todayTs) / 86_400_000);
    }
  }
  const todayTs = todayCalendarTs(from);

  if (sub.due_dates) {
    const dates = parseDueDates(sub);
    const nearest = nearestDueFromList(dates, from);
    if (!nearest) return null;
    const due = parseIsoDateUtc(nearest);
    if (due == null) return null;
    return Math.round((due - todayTs) / 86_400_000);
  }

  if (sub.frequency === 'once') {
    if (!sub.due_date) return null;
    const due = parseIsoDateUtc(sub.due_date);
    if (due == null) return null;
    return Math.round((due - todayTs) / 86_400_000);
  }

  switch (sub.frequency) {
    case 'monthly': {
      const due = nextMonthlyDueTs(sub, todayTs, from);
      return Math.round((due - todayTs) / 86_400_000);
    }
    case 'weekly': {
      const currentDow = from.getDay() === 0 ? 7 : from.getDay();
      const target = resolveWeekday(sub);
      let delta = target - currentDow;
      if (delta < 0) delta += 7;
      return delta;
    }
    case 'yearly': {
      const due = nextYearlyDueTs(sub, todayTs, from);
      return Math.round((due - todayTs) / 86_400_000);
    }
    default: {
      const _exhaustive: never = sub.frequency;
      return _exhaustive;
    }
  }
}

export function nextDueIsoDate(sub: DueFields, from = new Date()): string | null {
  if (sub.due_dates) {
    const dates = parseDueDates(sub);
    return nearestDueFromList(dates, from);
  }
  const days = daysUntilNextDue(sub, from);
  if (days == null) return null;
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localIsoDate(d);
}

export function formatNextDueDate(sub: DueFields, from = new Date()): string | null {
  const iso = nextDueIsoDate(sub, from);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

export function earliestDueDays(subs: Subscription[], from = new Date()): number {
  let min = 9999;
  for (const sub of subs) {
    const d = daysUntilNextDue(sub, from);
    if (d != null && d < min) min = d;
  }
  return min;
}

export const UNCATEGORIZED_LABEL = 'Sin categoría';

function resolveAnchorDay(sub: DueFields): number {
  if (sub.due_day >= 1 && sub.due_day <= 31) {
    return clampDay(sub.due_day);
  }
  if (sub.due_date) {
    const parts = parseIsoParts(sub.due_date);
    if (parts) return parts.day;
  }
  return clampDay(sub.due_day);
}

function resolveYearlyAnchor(sub: DueFields): { month: number; day: number } {
  const day = clampDay(sub.due_day);
  if (sub.due_date) {
    const parts = parseIsoParts(sub.due_date);
    if (parts) return { month: parts.month, day };
  }
  const created = new Date(sub.created_at);
  return { month: created.getMonth(), day };
}

function resolveWeekday(sub: DueFields): number {
  if (sub.due_day >= 1 && sub.due_day <= 7) {
    return clampWeekday(sub.due_day);
  }
  if (sub.due_date) {
    const ts = parseIsoDateUtc(sub.due_date);
    if (ts != null) {
      const dow = new Date(ts).getUTCDay();
      return dow === 0 ? 7 : dow;
    }
  }
  return clampWeekday(sub.due_day);
}

export function formatDueLabel(sub: DueFields, days: number | null): string {
  if (days == null) return 'Sin fecha';
  const multiCount = sub.due_dates ? parseDueDates(sub).length : 0;
  if (multiCount > 1 && days >= 0)
    return days === 0 ? 'Hoy (1 de varias)' : `En ${days} días · ${multiCount} fechas`;
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? 'Vencido ayer' : `Vencido hace ${n}d`;
  }
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
}

export function formatDueUrgency(
  days: number | null
): 'today' | 'soon' | 'normal' | 'past' | 'none' {
  if (days == null) return 'none';
  if (days < 0) return 'past';
  if (days === 0) return 'today';
  if (days <= 3) return 'soon';
  return 'normal';
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensual',
  yearly: 'Anual',
  once: 'Pago único',
};

function parseIsoParts(iso: string): { month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { month: Number(m[2]) - 1, day: Number(m[3]) };
}

function parseIsoDateUtc(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function safeUtcDate(year: number, month: number, day: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(day, lastDay));
}

function formatIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function clampDay(day: number): number {
  return Math.min(Math.max(day, 1), 31);
}

function clampWeekday(day: number): number {
  return Math.min(Math.max(day, 1), 7);
}

export function sortByNextDue(a: Subscription, b: Subscription): number {
  const da = daysUntilNextDue(a) ?? 9999;
  const db = daysUntilNextDue(b) ?? 9999;
  return da - db;
}

/** Next cycle anchor after marking a recurring bill paid. */
export function advanceDueDateAfterPayment(
  sub: DueFields,
  from = new Date()
): { due_date: string; due_day: number; due_dates: string | null } | null {
  if (sub.due_dates) {
    const dates = parseDueDates(sub);
    const current = nearestDueFromList(dates, from);
    if (!current) return null;
    const remaining = removeDueDate(dates, current);
    if (remaining.length === 0) return null;
    const next = nearestDueFromList(remaining, from)!;
    return {
      due_date: next,
      due_day: Number(next.slice(8, 10)),
      due_dates: serializeDueDates(remaining),
    };
  }

  if (sub.frequency === 'once') return null;

  const currentNext = nextDueIsoDate(sub, from);
  if (!currentNext) return null;

  const nextDue = addPeriodToIsoDate(currentNext, sub.frequency as Exclude<Frequency, 'once'>, sub);
  const due_day =
    sub.frequency === 'weekly'
      ? resolveWeekday({ ...sub, due_date: nextDue })
      : // Preserve the original due_day anchor (e.g. 31) regardless of whether
        // addPeriodToIsoDate clamped this month's actual date.
        clampDay(sub.due_day);

  return { due_date: nextDue, due_day, due_dates: null };
}

export interface UrgencyBuckets {
  overdue: Subscription[];
  today: Subscription[];
  soon: Subscription[];
}

export function partitionByUrgency(subs: Subscription[], from = new Date()): UrgencyBuckets {
  const overdue: Subscription[] = [];
  const today: Subscription[] = [];
  const soon: Subscription[] = [];

  for (const sub of subs) {
    const days = daysUntilNextDue(sub, from);
    if (days == null) continue;
    if (days < 0) overdue.push(sub);
    else if (days === 0) today.push(sub);
    else if (days <= 7) soon.push(sub);
  }

  overdue.sort(sortByNextDue);
  today.sort(sortByNextDue);
  soon.sort(sortByNextDue);

  return { overdue, today, soon };
}

function addPeriodToIsoDate(
  iso: string,
  frequency: Exclude<Frequency, 'once'>,
  sub: DueFields
): string {
  const [y, m, d] = iso.split('-').map(Number);

  switch (frequency) {
    case 'weekly':
      return formatIsoDate(new Date(Date.UTC(y, m - 1, d + 7)));
    case 'monthly': {
      const anchor = resolveAnchorDay(sub);
      return formatIsoDate(new Date(safeUtcDate(y, m, anchor)));
    }
    case 'yearly': {
      const anchor = resolveYearlyAnchor(sub);
      return formatIsoDate(new Date(safeUtcDate(y + 1, anchor.month, anchor.day)));
    }
    default: {
      const _exhaustive: never = frequency;
      return _exhaustive;
    }
  }
}
