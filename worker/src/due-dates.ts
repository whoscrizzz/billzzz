import type { Frequency, SubscriptionRow } from "./env";

type DueSub = Pick<
  SubscriptionRow,
  "frequency" | "due_day" | "due_date" | "created_at" | "snoozed_until"
>;

export function daysUntilNextDue(sub: DueSub, from = new Date()): number | null {
  if (sub.snoozed_until) {
    const snoozeEnd = parseIsoDateUtc(sub.snoozed_until);
    const todayUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    if (snoozeEnd != null && snoozeEnd > todayUtc) {
      return Math.round((snoozeEnd - todayUtc) / 86_400_000);
    }
  }
  const todayUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());

  if (sub.frequency === "once") {
    if (!sub.due_date) return null;
    const due = parseIsoDateUtc(sub.due_date);
    if (due == null) return null;
    return Math.round((due - todayUtc) / 86_400_000);
  }

  switch (sub.frequency) {
    case "monthly": {
      const anchor = resolveAnchorDay(sub);
      const year = from.getUTCFullYear();
      const month = from.getUTCMonth();
      let due = safeUtcDate(year, month, anchor);
      if (due < todayUtc) due = safeUtcDate(year, month + 1, anchor);
      return Math.round((due - todayUtc) / 86_400_000);
    }
    case "weekly": {
      const currentDow = from.getUTCDay() === 0 ? 7 : from.getUTCDay();
      const target = resolveWeekday(sub);
      let delta = target - currentDow;
      if (delta < 0) delta += 7;
      return delta;
    }
    case "yearly": {
      const { month, day } = resolveYearlyAnchor(sub);
      const year = from.getUTCFullYear();
      let due = safeUtcDate(year, month, day);
      if (due < todayUtc) due = safeUtcDate(year + 1, month, day);
      return Math.round((due - todayUtc) / 86_400_000);
    }
    default: {
      const _exhaustive: never = sub.frequency;
      return _exhaustive;
    }
  }
}

export function nextDueIsoDate(sub: DueSub, from = new Date()): string | null {
  const days = daysUntilNextDue(sub, from);
  if (days == null) return null;
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDate(d);
}

export function resolveAnchorDay(sub: DueSub): number {
  if (sub.due_date) {
    const parts = parseIsoParts(sub.due_date);
    if (parts) return parts.day;
  }
  return clampDay(sub.due_day);
}

export function resolveYearlyAnchor(sub: DueSub): { month: number; day: number } {
  if (sub.due_date) {
    const parts = parseIsoParts(sub.due_date);
    if (parts) return { month: parts.month, day: parts.day };
  }
  const created = new Date(sub.created_at);
  return { month: created.getUTCMonth(), day: clampDay(sub.due_day) };
}

export function resolveWeekday(sub: DueSub): number {
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

function formatIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function clampDay(day: number): number {
  return Math.min(Math.max(day, 1), 31);
}

function clampWeekday(day: number): number {
  return Math.min(Math.max(day, 1), 7);
}

export function isValidFrequency(value: string): value is Frequency {
  return value === "weekly" || value === "monthly" || value === "yearly" || value === "once";
}

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Next cycle anchor after marking a recurring bill paid. */
export function advanceDueDateAfterPayment(
  sub: DueSub,
  from = new Date(),
): { due_date: string; due_day: number } | null {
  if (sub.frequency === "once") return null;

  const currentNext = nextDueIsoDate(sub, from);
  if (!currentNext) return null;

  const nextDue = addPeriodToIsoDate(currentNext, sub.frequency as Exclude<Frequency, "once">, sub);
  const due_day =
    sub.frequency === "weekly"
      ? resolveWeekday({ ...sub, due_date: nextDue })
      : Number(nextDue.slice(8, 10));

  return { due_date: nextDue, due_day };
}

function addPeriodToIsoDate(
  iso: string,
  frequency: Exclude<Frequency, "once">,
  sub: DueSub,
): string {
  const [y, m, d] = iso.split("-").map(Number);

  switch (frequency) {
    case "weekly":
      return formatIsoDate(new Date(Date.UTC(y, m - 1, d + 7)));
    case "monthly": {
      const anchor = resolveAnchorDay(sub);
      return formatIsoDate(new Date(safeUtcDate(y, m, anchor)));
    }
    case "yearly": {
      const anchor = resolveYearlyAnchor(sub);
      return formatIsoDate(new Date(safeUtcDate(y + 1, anchor.month, anchor.day)));
    }
    default: {
      const _exhaustive: never = frequency;
      return _exhaustive;
    }
  }
}

export function deriveDueFields(
  frequency: Frequency,
  dueDate: string | null | undefined,
  dueDay: number | undefined,
): { due_date: string | null; due_day: number } | { error: string } {
  if (frequency === "once") {
    if (!dueDate || !isValidIsoDate(dueDate)) {
      return { error: "due_date (YYYY-MM-DD) is required for one-off payments" };
    }
    return { due_date: dueDate, due_day: parseInt(dueDate.slice(8, 10), 10) };
  }

  if (frequency === "weekly") {
    if (dueDate && isValidIsoDate(dueDate)) {
      const ts = Date.UTC(
        Number(dueDate.slice(0, 4)),
        Number(dueDate.slice(5, 7)) - 1,
        Number(dueDate.slice(8, 10)),
      );
      const dow = new Date(ts).getUTCDay();
      return { due_date: dueDate, due_day: dow === 0 ? 7 : dow };
    }
    if (dueDay != null && dueDay >= 1 && dueDay <= 7) {
      return { due_date: null, due_day: dueDay };
    }
    return { error: "due_date or due_day (1–7) is required for weekly payments" };
  }

  if (frequency === "monthly" || frequency === "yearly") {
    if (dueDate && isValidIsoDate(dueDate)) {
      return { due_date: dueDate, due_day: parseInt(dueDate.slice(8, 10), 10) };
    }
    if (dueDay != null && dueDay >= 1 && dueDay <= 31) {
      return { due_date: null, due_day: dueDay };
    }
    return { error: "due_date is required for recurring payments" };
  }

  const _exhaustive: never = frequency;
  return _exhaustive;
}
