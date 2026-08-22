import type { DueDateEntry } from '../types/subscription';

export type { DueDateEntry };

export function isValidIso(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(0);
  candidate.setUTCHours(0, 0, 0, 0);
  candidate.setUTCFullYear(year, month - 1, day);

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function normalizeEntry(raw: unknown): DueDateEntry | null {
  if (typeof raw === 'string') {
    return isValidIso(raw) ? { date: raw } : null;
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.date !== 'string' || !isValidIso(obj.date)) return null;
    const amount =
      typeof obj.amount === 'number' && Number.isFinite(obj.amount) && obj.amount >= 0
        ? obj.amount
        : undefined;
    return amount !== undefined ? { date: obj.date, amount } : { date: obj.date };
  }
  return null;
}

/**
 * Parse due_dates (JSON string, ya sea el formato legado string[] o el actual
 * {date, amount?}[]) y el legacy due_date. Cada fecha puede traer su propio
 * monto — si no lo trae, el llamador debe usar el monto base de la suscripción.
 */
export function parseDueDates(sub: {
  due_dates?: string | DueDateEntry[] | null;
  due_date?: string | null;
}): DueDateEntry[] {
  if (sub.due_dates) {
    const raw = Array.isArray(sub.due_dates) ? sub.due_dates : safeParseArray(sub.due_dates);
    if (raw) {
      const map = new Map<string, DueDateEntry>();
      for (const item of raw) {
        const entry = normalizeEntry(item);
        if (entry) map.set(entry.date, entry);
      }
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    }
  }
  if (sub.due_date && isValidIso(sub.due_date)) return [{ date: sub.due_date }];
  return [];
}

function safeParseArray(value: string): unknown[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeDueDates(entries: DueDateEntry[]): string | null {
  const map = new Map<string, DueDateEntry>();
  for (const e of entries) {
    if (!isValidIso(e.date)) continue;
    const amount =
      typeof e.amount === 'number' && Number.isFinite(e.amount) && e.amount >= 0
        ? e.amount
        : undefined;
    map.set(e.date, amount !== undefined ? { date: e.date, amount } : { date: e.date });
  }
  const clean = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  if (clean.length === 0) return null;
  return JSON.stringify(clean);
}

/** El monto de una fecha específica: su override si existe, si no el monto base. */
export function resolveAmountForDate(
  sub: {
    amount: number;
    due_dates?: string | DueDateEntry[] | null;
    due_date?: string | null;
  },
  dateIso: string
): number {
  const match = parseDueDates(sub).find((e) => e.date === dateIso);
  return match?.amount ?? sub.amount;
}

/**
 * El monto que corresponde "ahora" (la fecha próxima/pendiente más cercana).
 * Para suscripciones sin fechas personalizadas simplemente cae al monto base.
 */
export function currentDueAmount(
  sub: {
    amount: number;
    due_dates?: string | DueDateEntry[] | null;
    due_date?: string | null;
  },
  from = new Date()
): number {
  const entries = parseDueDates(sub);
  if (entries.length === 0) return sub.amount;
  const nearest = nearestDueFromList(entries, from);
  if (!nearest) return sub.amount;
  return resolveAmountForDate(sub, nearest);
}

export function nearestDueFromList(entries: DueDateEntry[], from = new Date()): string | null {
  if (entries.length === 0) return null;
  const todayTs = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  let bestFuture: string | null = null;
  let bestFutureDays = Infinity;
  let bestPast: string | null = null;
  let bestPastDays = -Infinity;

  for (const { date: iso } of entries) {
    const ts = parseIsoDateUtc(iso);
    if (ts == null) continue;
    const days = Math.round((ts - todayTs) / 86_400_000);
    if (days >= 0 && days < bestFutureDays) {
      bestFutureDays = days;
      bestFuture = iso;
    }
    if (days < 0 && days > bestPastDays) {
      bestPastDays = days;
      bestPast = iso;
    }
  }

  return bestFuture ?? bestPast;
}

export function removeDueDate(entries: DueDateEntry[], toRemove: string): DueDateEntry[] {
  return entries.filter((e) => e.date !== toRemove).sort((a, b) => a.date.localeCompare(b.date));
}

export function isValidDueDay(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31;
}

/** Patrón perpetuo de varios días del mes (p. ej. [1, 15]) — `due_days` es JSON crudo. */
export function parseDueDaysList(sub: { due_days?: string | number[] | null }): number[] {
  if (!sub.due_days) return [];
  const raw = Array.isArray(sub.due_days) ? sub.due_days : safeParseArray(sub.due_days);
  if (!raw) return [];
  const days = raw.filter(isValidDueDay);
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

export function serializeDueDays(days: number[]): string | null {
  const clean = Array.from(new Set(days.filter(isValidDueDay))).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  return JSON.stringify(clean);
}

function parseIsoDateUtc(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
