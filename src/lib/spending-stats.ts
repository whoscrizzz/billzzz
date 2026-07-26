import type { Subscription } from '../types/subscription';
import { resolveAmountForDate } from './due-dates-json';

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

function monthlyEquivalent(sub: Subscription, year: number, month: number): number {
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
    default: {
      const _exhaustive: never = sub.frequency;
      return _exhaustive;
    }
  }
}

function dueDaysInMonth(sub: Subscription, year: number, month: number): number[] {
  const last = lastDayOfMonth(year, month);

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
    // Solo el caso 'once' corresponde a una fecha ISO concreta con posible
    // monto propio (due_date); monthly/weekly/yearly usan el monto base.
    const amount =
      sub.frequency === 'once' && sub.due_date
        ? resolveAmountForDate(sub, sub.due_date)
        : sub.amount;
    for (const day of dueDaysInMonth(sub, year, month)) {
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
