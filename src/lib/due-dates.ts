import type { Frequency, Subscription } from "../types/subscription";

type DueFields = Pick<
  Subscription,
  "frequency" | "due_day" | "due_date" | "created_at" | "snoozed_until"
>;

export function daysUntilNextDue(sub: DueFields, from = new Date()): number | null {
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

export function nextDueIsoDate(sub: DueFields, from = new Date()): string | null {
  const days = daysUntilNextDue(sub, from);
  if (days == null) return null;
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDate(d);
}

export function formatNextDueDate(sub: DueFields, from = new Date()): string | null {
  const iso = nextDueIsoDate(sub, from);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function resolveAnchorDay(sub: DueFields): number {
  if (sub.due_date) {
    const parts = parseIsoParts(sub.due_date);
    if (parts) return parts.day;
  }
  return clampDay(sub.due_day);
}

function resolveYearlyAnchor(sub: DueFields): { month: number; day: number } {
  if (sub.due_date) {
    const parts = parseIsoParts(sub.due_date);
    if (parts) return { month: parts.month, day: parts.day };
  }
  const created = new Date(sub.created_at);
  return { month: created.getUTCMonth(), day: clampDay(sub.due_day) };
}

function resolveWeekday(sub: DueFields): number {
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
  if (days == null) return "Sin fecha";
  if (days < 0) return sub.frequency === "once" ? "Vencido" : "Próximo ciclo";
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}

export function formatDueUrgency(days: number | null): "today" | "soon" | "normal" | "past" | "none" {
  if (days == null) return "none";
  if (days < 0) return "past";
  if (days === 0) return "today";
  if (days <= 3) return "soon";
  return "normal";
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Semanal",
  monthly: "Mensual",
  yearly: "Anual",
  once: "Pago único",
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

export function sortByNextDue(a: Subscription, b: Subscription): number {
  const da = daysUntilNextDue(a) ?? 9999;
  const db = daysUntilNextDue(b) ?? 9999;
  return da - db;
}
