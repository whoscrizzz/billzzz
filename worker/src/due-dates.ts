import type { Frequency, IntervalUnit, SubscriptionRow } from './env';
import {
  nearestDueFromList,
  parseDueDates,
  parseDueDaysList,
  removeDueDate,
  serializeDueDates,
} from './due-dates-json';
import { getDateInTimeZone } from './timezone';

type DueSub = Pick<
  SubscriptionRow,
  | 'frequency'
  | 'due_day'
  | 'due_date'
  | 'due_dates'
  | 'due_days'
  | 'interval_count'
  | 'interval_unit'
  | 'created_at'
  | 'snoozed_until'
>;

function nextMonthlyDueTs(sub: DueSub, todayUtc: number, from: Date): number {
  const anchor = resolveAnchorDay(sub);

  if (sub.due_date) {
    const storedTs = parseIsoDateUtc(sub.due_date);
    if (storedTs != null) {
      if (storedTs >= todayUtc) return storedTs;
      let y = Number(sub.due_date.slice(0, 4));
      let m = Number(sub.due_date.slice(5, 7)) - 1;
      let due = safeUtcDate(y, m, anchor);
      while (due < todayUtc) {
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

  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  let due = safeUtcDate(year, month, anchor);
  if (due < todayUtc) due = safeUtcDate(year, month + 1, anchor);
  return due;
}

function nextYearlyDueTs(sub: DueSub, todayUtc: number, from: Date): number {
  const { month, day } = resolveYearlyAnchor(sub);

  if (sub.due_date) {
    const storedTs = parseIsoDateUtc(sub.due_date);
    if (storedTs != null) {
      if (storedTs >= todayUtc) return storedTs;
      let y = Number(sub.due_date.slice(0, 4)) + 1;
      let due = safeUtcDate(y, month, day);
      while (due < todayUtc) {
        y += 1;
        due = safeUtcDate(y, month, day);
      }
      return due;
    }
  }

  const year = from.getUTCFullYear();
  let due = safeUtcDate(year, month, day);
  if (due < todayUtc) due = safeUtcDate(year + 1, month, day);
  return due;
}

export function daysUntilNextDue(sub: DueSub, from = new Date(), timezone?: string): number | null {
  // Anchored to the notify-timezone calendar day (not raw UTC) so this agrees
  // with shouldNotifyNow's hour-of-day check — otherwise the two can disagree
  // by a day during the hours when the UTC and local calendar dates differ.
  if (sub.snoozed_until) {
    const snoozeEnd = parseIsoDateUtc(sub.snoozed_until);
    const todayUtc = getDateInTimeZone(from, timezone);
    if (snoozeEnd != null && snoozeEnd > todayUtc) {
      return Math.round((snoozeEnd - todayUtc) / 86_400_000);
    }
  }
  const todayUtc = getDateInTimeZone(from, timezone);

  if (sub.due_dates) {
    const dates = parseDueDates(sub);
    const nearest = nearestDueFromList(dates, from, timezone);
    if (!nearest) return null;
    const due = parseIsoDateUtc(nearest);
    if (due == null) return null;
    return Math.round((due - todayUtc) / 86_400_000);
  }

  const dueDaysList = parseDueDaysList(sub);
  if (dueDaysList.length > 0) {
    const nextIso = nextDueDayFrom(dueDaysList, formatIsoDate(new Date(todayUtc)));
    const due = parseIsoDateUtc(nextIso);
    if (due == null) return null;
    return Math.round((due - todayUtc) / 86_400_000);
  }

  if (sub.frequency === 'once') {
    if (!sub.due_date) return null;
    const due = parseIsoDateUtc(sub.due_date);
    if (due == null) return null;
    return Math.round((due - todayUtc) / 86_400_000);
  }

  switch (sub.frequency) {
    case 'monthly': {
      const due = nextMonthlyDueTs(sub, todayUtc, from);
      return Math.round((due - todayUtc) / 86_400_000);
    }
    case 'weekly': {
      const currentDow = from.getUTCDay() === 0 ? 7 : from.getUTCDay();
      const target = resolveWeekday(sub);
      let delta = target - currentDow;
      if (delta < 0) delta += 7;
      return delta;
    }
    case 'yearly': {
      const due = nextYearlyDueTs(sub, todayUtc, from);
      return Math.round((due - todayUtc) / 86_400_000);
    }
    case 'interval': {
      const due = nextIntervalDueTs(sub, todayUtc);
      return Math.round((due - todayUtc) / 86_400_000);
    }
    default: {
      const _exhaustive: never = sub.frequency;
      return _exhaustive;
    }
  }
}

/** Próxima ocurrencia (timestamp UTC) para frequency 'interval', buscando hacia adelante desde el ancla. */
function nextIntervalDueTs(sub: DueSub, todayUtc: number): number {
  const count = sub.interval_count ?? 1;
  const unit = sub.interval_unit ?? 'day';
  let anchorIso = sub.due_date ?? formatIsoDate(new Date(sub.created_at));
  let due = parseIsoDateUtc(anchorIso);
  if (due == null) return todayUtc;
  let guard = 0;
  while (due < todayUtc && guard < 10_000) {
    anchorIso = addIntervalToIsoDate(anchorIso, count, unit);
    due = parseIsoDateUtc(anchorIso)!;
    guard += 1;
  }
  return due;
}

export function nextDueIsoDate(sub: DueSub, from = new Date(), timezone?: string): string | null {
  if (sub.due_dates) {
    const dates = parseDueDates(sub);
    return nearestDueFromList(dates, from, timezone);
  }
  const days = daysUntilNextDue(sub, from, timezone);
  if (days == null) return null;
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDate(d);
}

export function resolveAnchorDay(sub: DueSub): number {
  if (sub.due_day >= 1 && sub.due_day <= 31) {
    return clampDay(sub.due_day);
  }
  if (sub.due_date) {
    const parts = parseIsoParts(sub.due_date);
    if (parts) return parts.day;
  }
  return clampDay(sub.due_day);
}

export function resolveYearlyAnchor(sub: DueSub): { month: number; day: number } {
  const day = clampDay(sub.due_day);
  if (sub.due_date) {
    const parts = parseIsoParts(sub.due_date);
    if (parts) return { month: parts.month, day };
  }
  const created = new Date(sub.created_at);
  return { month: created.getUTCMonth(), day };
}

export function resolveWeekday(sub: DueSub): number {
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

function parseIsoParts(iso: string): { month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { month: Number(m[2]) - 1, day: Number(m[3]) };
}

function parseIsoDateUtc(iso: string): number | null {
  const parts = parseIsoParts(iso);
  if (!parts) return null;
  return Date.UTC(Number(iso.slice(0, 4)), parts.month, parts.day);
}

function safeUtcDate(year: number, month: number, day: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(day, lastDay));
}

export function formatIsoDate(date: Date): string {
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

export function isValidFrequency(value: string): value is Frequency {
  return (
    value === 'weekly' ||
    value === 'monthly' ||
    value === 'yearly' ||
    value === 'once' ||
    value === 'interval'
  );
}

export function isValidIntervalUnit(value: string): value is IntervalUnit {
  return value === 'day' || value === 'week' || value === 'month';
}

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Next cycle anchor after marking a recurring bill paid. */
export function advanceDueDateAfterPayment(
  sub: DueSub,
  from = new Date(),
  timezone?: string
): { due_date: string; due_day: number; due_dates: string | null } | null {
  if (sub.due_dates) {
    const dates = parseDueDates(sub);
    const current = nearestDueFromList(dates, from, timezone);
    if (!current) return null;
    const remaining = removeDueDate(dates, current);
    if (remaining.length === 0) return null;
    const next = nearestDueFromList(remaining, from, timezone)!;
    return {
      due_date: next,
      due_day: Number(next.slice(8, 10)),
      due_dates: serializeDueDates(remaining),
    };
  }

  const dueDaysList = parseDueDaysList(sub);
  if (dueDaysList.length > 0) {
    const currentNext = nextDueIsoDate(sub, from, timezone);
    if (!currentNext) return null;
    const dayAfter = parseIsoDateUtc(currentNext);
    if (dayAfter == null) return null;
    const next = nextDueDayFrom(dueDaysList, formatIsoDate(new Date(dayAfter + 86_400_000)));
    return { due_date: next, due_day: Number(next.slice(8, 10)), due_dates: null };
  }

  if (sub.frequency === 'once') return null;

  const currentNext = nextDueIsoDate(sub, from, timezone);
  if (!currentNext) return null;

  const nextDue = addPeriodToIsoDate(currentNext, sub.frequency as Exclude<Frequency, 'once'>, sub);
  const due_day =
    sub.frequency === 'weekly'
      ? resolveWeekday({ ...sub, due_date: nextDue })
      : sub.frequency === 'monthly' || sub.frequency === 'yearly'
        ? clampDay(sub.due_day)
        : Number(nextDue.slice(8, 10));

  return { due_date: nextDue, due_day, due_dates: null };
}

function addPeriodToIsoDate(
  iso: string,
  frequency: Exclude<Frequency, 'once'>,
  sub: DueSub
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
    case 'interval':
      return addIntervalToIsoDate(iso, sub.interval_count ?? 1, sub.interval_unit ?? 'day');
    default: {
      const _exhaustive: never = frequency;
      return _exhaustive;
    }
  }
}

/** Avanza exactamente un paso de intervalo desde una fecha ISO conocida. */
export function addIntervalToIsoDate(iso: string, count: number, unit: IntervalUnit): string {
  const [y, m, d] = iso.split('-').map(Number);
  switch (unit) {
    case 'day':
      return formatIsoDate(new Date(Date.UTC(y, m - 1, d + count)));
    case 'week':
      return formatIsoDate(new Date(Date.UTC(y, m - 1, d + count * 7)));
    case 'month':
      return formatIsoDate(new Date(safeUtcDate(y, m - 1 + count, d)));
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

/**
 * Próxima fecha (>= fromIso, inclusive) dentro de un patrón de varios días
 * del mes (p. ej. [1, 15]). Si no queda ninguno en el mes de fromIso, cae al
 * primer día del patrón del mes siguiente. `days` viene ordenado y sin
 * duplicados (parseDueDaysList ya lo garantiza) y siempre trae ≥1 elemento.
 */
export function nextDueDayFrom(days: number[], fromIso: string): string {
  const [y, m, d] = fromIso.split('-').map(Number);
  const sameMonth = days.find((day) => day >= d);
  if (sameMonth != null) {
    return formatIsoDate(new Date(safeUtcDate(y, m - 1, sameMonth)));
  }
  return formatIsoDate(new Date(safeUtcDate(y, m, days[0])));
}

export function deriveDueFields(
  frequency: Frequency,
  dueDate: string | null | undefined,
  dueDay: number | undefined
): { due_date: string | null; due_day: number } | { error: string } {
  if (frequency === 'once') {
    if (!dueDate || !isValidIsoDate(dueDate)) {
      return { error: 'due_date (YYYY-MM-DD) is required for one-off payments' };
    }
    return { due_date: dueDate, due_day: parseInt(dueDate.slice(8, 10), 10) };
  }

  if (frequency === 'weekly') {
    if (dueDate && isValidIsoDate(dueDate)) {
      const ts = Date.UTC(
        Number(dueDate.slice(0, 4)),
        Number(dueDate.slice(5, 7)) - 1,
        Number(dueDate.slice(8, 10))
      );
      const dow = new Date(ts).getUTCDay();
      return { due_date: null, due_day: dow === 0 ? 7 : dow };
    }
    if (dueDay != null && dueDay >= 1 && dueDay <= 7) {
      return { due_date: null, due_day: dueDay };
    }
    return { error: 'due_date or due_day (1–7) is required for weekly payments' };
  }

  if (frequency === 'monthly' || frequency === 'yearly') {
    if (dueDate && isValidIsoDate(dueDate)) {
      return { due_date: dueDate, due_day: parseInt(dueDate.slice(8, 10), 10) };
    }
    if (dueDay != null && dueDay >= 1 && dueDay <= 31) {
      return { due_date: null, due_day: dueDay };
    }
    return { error: 'due_date is required for recurring payments' };
  }

  if (frequency === 'interval') {
    if (!dueDate || !isValidIsoDate(dueDate)) {
      return { error: 'due_date (YYYY-MM-DD) is required as the interval anchor' };
    }
    return { due_date: dueDate, due_day: parseInt(dueDate.slice(8, 10), 10) };
  }

  const _exhaustive: never = frequency;
  return _exhaustive;
}
