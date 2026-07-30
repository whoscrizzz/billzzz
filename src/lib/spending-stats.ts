import type { IntervalUnit, Subscription } from '../types/subscription';
import { addIntervalToIsoDate } from './due-dates';
import { parseDueDates, parseDueDaysList, resolveAmountForDate } from './due-dates-json';

export interface DayTotal {
  day: number;
  amount: number;
  items: { name: string; amount: number }[];
}

export interface CategorySlice {
  category: string;
  amount: number;
  pct: number;
  hue: number;
}

const WEEKLY_TO_MONTHLY = 52 / 12;

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

function anchorDay(sub: Subscription): number {
  if (sub.due_date) {
    const p = parseIso(sub.due_date);
    if (p) return p.day;
  }
  return sub.due_day;
}

function anchorMonth(sub: Subscription): number {
  if (sub.due_date) {
    const p = parseIso(sub.due_date);
    if (p) return p.month;
  }
  return new Date(sub.created_at).getMonth();
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Longitud aproximada en días de un paso de intervalo — 30.44 = 365.25 / 12 para 'month'. */
function intervalLengthInDays(count: number, unit: IntervalUnit): number {
  switch (unit) {
    case 'day':
      return count;
    case 'week':
      return count * 7;
    case 'month':
      return count * 30.44;
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

/** Días del mes [year, month] en los que cae una ocurrencia de frequency 'interval'. */
function intervalOccurrencesInMonth(sub: Subscription, year: number, month: number): number[] {
  const count = sub.interval_count ?? 1;
  const unit = sub.interval_unit ?? 'day';
  if (count < 1) return [];

  const monthStartTs = Date.UTC(year, month, 1);
  const monthEndTs = Date.UTC(year, month + 1, 1);
  let anchorIso = sub.due_date ?? sub.created_at.slice(0, 10);
  let ts = Date.UTC(
    Number(anchorIso.slice(0, 4)),
    Number(anchorIso.slice(5, 7)) - 1,
    Number(anchorIso.slice(8, 10))
  );

  // Anclas antiguas no deberían tardar más de unos cientos de pasos en
  // alcanzar el mes pedido para cualquier suscripción realista.
  let guard = 0;
  while (ts < monthStartTs && guard < 5000) {
    anchorIso = addIntervalToIsoDate(anchorIso, count, unit);
    ts = Date.UTC(
      Number(anchorIso.slice(0, 4)),
      Number(anchorIso.slice(5, 7)) - 1,
      Number(anchorIso.slice(8, 10))
    );
    guard += 1;
  }

  const days: number[] = [];
  guard = 0;
  while (ts < monthEndTs && guard < 100) {
    if (ts >= monthStartTs) days.push(new Date(ts).getUTCDate());
    const nextIso = addIntervalToIsoDate(anchorIso, count, unit);
    const nextTs = Date.UTC(
      Number(nextIso.slice(0, 4)),
      Number(nextIso.slice(5, 7)) - 1,
      Number(nextIso.slice(8, 10))
    );
    if (nextTs <= ts) break;
    anchorIso = nextIso;
    ts = nextTs;
    guard += 1;
  }
  return days;
}

export function monthlyEquivalent(sub: Subscription, year: number, month: number): number {
  if (sub.due_dates) {
    const entries = parseDueDates(sub).filter((e) => {
      const p = parseIso(e.date);
      return p != null && p.year === year && p.month === month;
    });
    return entries.reduce((sum, e) => sum + (e.amount ?? sub.amount), 0);
  }

  if (parseDueDaysList(sub).length > 0) {
    return sub.amount * dueDaysInMonth(sub, year, month).length;
  }

  switch (sub.frequency) {
    case 'monthly':
      return sub.amount;
    case 'yearly':
      return anchorMonth(sub) === month ? sub.amount / 12 : sub.amount / 12;
    case 'weekly':
      return sub.amount * WEEKLY_TO_MONTHLY;
    case 'once': {
      if (!sub.due_date) return 0;
      const p = parseIso(sub.due_date);
      if (!p || p.year !== year || p.month !== month) return 0;
      return resolveAmountForDate(sub, sub.due_date);
    }
    case 'interval': {
      const days = intervalLengthInDays(sub.interval_count ?? 1, sub.interval_unit ?? 'day');
      return days > 0 ? (30.44 / days) * sub.amount : 0;
    }
    default: {
      const _exhaustive: never = sub.frequency;
      return _exhaustive;
    }
  }
}

function dueDaysInMonth(sub: Subscription, year: number, month: number): number[] {
  const last = lastDayOfMonth(year, month);

  if (sub.due_dates) {
    return parseDueDates(sub)
      .filter((e) => {
        const p = parseIso(e.date);
        return p != null && p.year === year && p.month === month;
      })
      .map((e) => Number(e.date.slice(8, 10)));
  }

  const daysList = parseDueDaysList(sub);
  if (daysList.length > 0) {
    return Array.from(new Set(daysList.map((d) => Math.min(d, last)))).sort((a, b) => a - b);
  }

  switch (sub.frequency) {
    case 'monthly': {
      const day = Math.min(anchorDay(sub), last);
      return [day];
    }
    case 'yearly': {
      if (anchorMonth(sub) !== month) return [];
      const day = Math.min(anchorDay(sub), last);
      return [day];
    }
    case 'once': {
      if (!sub.due_date) return [];
      const p = parseIso(sub.due_date);
      if (!p || p.year !== year || p.month !== month) return [];
      return [p.day];
    }
    case 'weekly': {
      const target = sub.due_date
        ? (() => {
            const p = parseIso(sub.due_date);
            if (!p) return sub.due_day;
            const dow = new Date(p.year, p.month, p.day).getDay();
            return dow === 0 ? 7 : dow;
          })()
        : sub.due_day;
      const days: number[] = [];
      for (let d = 1; d <= last; d++) {
        const dow = new Date(year, month, d).getDay();
        const normalized = dow === 0 ? 7 : dow;
        if (normalized === target) days.push(d);
      }
      return days;
    }
    case 'interval':
      return intervalOccurrencesInMonth(sub, year, month);
    default: {
      const _exhaustive: never = sub.frequency;
      return _exhaustive;
    }
  }
}

export function computeDayTotals(
  subscriptions: Subscription[],
  ref = new Date()
): { days: DayTotal[]; monthLabel: string; maxAmount: number; year: number; month: number } {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const last = lastDayOfMonth(year, month);
  const days: DayTotal[] = Array.from({ length: last }, (_, i) => ({
    day: i + 1,
    amount: 0,
    items: [],
  }));

  for (const sub of subscriptions) {
    for (const day of dueDaysInMonth(sub, year, month)) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      // Cae al monto base si el día no tiene un DueDateEntry.amount propio.
      const amount = resolveAmountForDate(sub, iso);
      const idx = day - 1;
      days[idx].amount += amount;
      days[idx].items.push({ name: sub.name, amount });
    }
  }

  const monthLabel = new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month, 1));

  const maxAmount = Math.max(...days.map((d) => d.amount), 1);

  return { days, monthLabel, maxAmount, year, month };
}

export function computeCategorySlices(
  subscriptions: Subscription[],
  ref = new Date()
): CategorySlice[] {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const totals = new Map<string, number>();

  for (const sub of subscriptions) {
    const cat = sub.category?.trim() || 'Otros';
    const eq = monthlyEquivalent(sub, year, month);
    totals.set(cat, (totals.get(cat) ?? 0) + eq);
  }

  const sum = Array.from(totals.values()).reduce((a, b) => a + b, 0) || 1;
  const slices: CategorySlice[] = [];

  for (const [category, amount] of totals) {
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
      hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    slices.push({
      category,
      amount,
      pct: (amount / sum) * 100,
      hue: Math.abs(hash) % 360,
    });
  }

  return slices.sort((a, b) => b.amount - a.amount);
}

export function computeMonthlyTotal(subscriptions: Subscription[], ref = new Date()): number {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  return subscriptions.reduce((sum, s) => sum + monthlyEquivalent(s, year, month), 0);
}

function annualEquivalent(sub: Subscription, year: number): number {
  if (sub.due_dates) {
    const entries = parseDueDates(sub).filter((e) => parseIso(e.date)?.year === year);
    return entries.reduce((sum, e) => sum + (e.amount ?? sub.amount), 0);
  }

  const daysList = parseDueDaysList(sub);
  if (daysList.length > 0) {
    return sub.amount * daysList.length * 12;
  }

  switch (sub.frequency) {
    case 'monthly':
      return sub.amount * 12;
    case 'yearly':
      return sub.amount;
    case 'weekly':
      return sub.amount * 52;
    case 'once': {
      if (!sub.due_date) return 0;
      const p = parseIso(sub.due_date);
      return p && p.year === year ? resolveAmountForDate(sub, sub.due_date) : 0;
    }
    case 'interval': {
      const days = intervalLengthInDays(sub.interval_count ?? 1, sub.interval_unit ?? 'day');
      return days > 0 ? (365.25 / days) * sub.amount : 0;
    }
    default: {
      const _exhaustive: never = sub.frequency;
      return _exhaustive;
    }
  }
}

export function computeTotalsByCurrency(
  subscriptions: Subscription[],
  ref = new Date()
): Record<string, { monthly: number; annual: number }> {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const totals: Record<string, { monthly: number; annual: number }> = {};

  for (const sub of subscriptions) {
    const cur = sub.currency || 'MXN';
    if (!totals[cur]) totals[cur] = { monthly: 0, annual: 0 };
    totals[cur].monthly += monthlyEquivalent(sub, year, month);
    totals[cur].annual += annualEquivalent(sub, year);
  }

  return totals;
}
