import type { IntervalUnit, PaymentRecord, Subscription } from '../types/subscription';
import {
  addIntervalToIsoDate,
  daysUntilNextDue,
  formatDueUrgency,
  nextDueIsoDate,
  UNCATEGORIZED_LABEL,
} from './due-dates';
import {
  currentDueAmount,
  parseDueDates,
  parseDueDaysList,
  resolveAmountForDate,
} from './due-dates-json';

export type CategoryRange = 'month' | 'quarter';

export interface CategoryTotal {
  category: string;
  total: number;
  count: number;
  avg: number;
  pct: number;
  payments: { name: string; amount: number; paid_at: string }[];
}

export type CalendarItemStatus = 'pagado' | 'vencido' | 'hoy' | 'pendiente';

export interface CalendarItem {
  name: string;
  amount: number;
  category: string;
  status: CalendarItemStatus;
}

export interface CalendarMonth {
  year: number;
  month: number;
  monthLabel: string;
  itemsByDay: Map<number, CalendarItem[]>;
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

function calendarStatus(days: number | null): CalendarItemStatus {
  const urgency = formatDueUrgency(days);
  if (urgency === 'past') return 'vencido';
  if (urgency === 'today') return 'hoy';
  return 'pendiente';
}

/**
 * Fase 8 — agrupa por día los pagos reales del mes (`payment_records`, en su
 * `paid_at` real) y el próximo vencimiento de cada suscripción (`due_date`,
 * que el backend ya avanza al marcar pagado). Un valor mutable por
 * suscripción, no una proyección de todas las ocurrencias futuras del
 * patrón de recurrencia — mismo modelo que el prototipo de referencia, y
 * evita inventar a qué ocurrencia programada corresponde un pago cuando hay
 * varios días fijos al mes (no hay vínculo explícito entre un
 * `payment_records` y qué fecha programada satisface).
 */
export function computeCalendarMonth(
  subscriptions: Subscription[],
  payments: PaymentRecord[],
  ref = new Date()
): CalendarMonth {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const itemsByDay = new Map<number, CalendarItem[]>();
  const push = (day: number, item: CalendarItem) => {
    const list = itemsByDay.get(day);
    if (list) list.push(item);
    else itemsByDay.set(day, [item]);
  };

  const categoryBySubId = new Map<string, string>();
  for (const s of subscriptions) {
    categoryBySubId.set(s.id, s.category?.trim() || UNCATEGORIZED_LABEL);
  }

  for (const p of payments) {
    const d = new Date(p.paid_at);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    push(d.getDate(), {
      name: p.subscription_name ?? 'Pago',
      amount: p.amount,
      category: categoryBySubId.get(p.subscription_id) ?? UNCATEGORIZED_LABEL,
      status: 'pagado',
    });
  }

  for (const sub of subscriptions) {
    // nextDueIsoDate (no sub.due_date crudo): para mensual/anual, el campo
    // guardado puede quedar en el pasado hasta que se marca pagado, pero
    // daysUntilNextDue/SubscriptionCard ya lo tratan como "vence el próximo
    // ciclo" — ubicar el item ahí evita que el calendario y el resto de la
    // app muestren fechas distintas para el mismo pago.
    const nextIso = nextDueIsoDate(sub, ref);
    if (!nextIso) continue;
    const p = parseIso(nextIso);
    if (!p || p.year !== year || p.month !== month) continue;
    push(p.day, {
      name: sub.name,
      amount: currentDueAmount(sub, ref),
      category: sub.category?.trim() || UNCATEGORIZED_LABEL,
      status: calendarStatus(daysUntilNextDue(sub, ref)),
    });
  }

  const monthLabel = new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month, 1));

  return { year, month, monthLabel, itemsByDay };
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

export interface BudgetOutlook {
  /** Ya pagado este mes (payment_records). */
  spent: number;
  /** Estimado de lo que falta por pagar este mes (puede ser 0). */
  upcoming: number;
  /** Proyección de cierre de mes al ritmo actual. */
  projectedTotal: number;
  /** Presupuesto restante para lo que queda del mes (puede ser negativo si ya se pasó). */
  remaining: number;
  /** Cuánto se puede gastar por día en lo que resta del mes (0 si no quedan días o no hay margen). */
  perDay: number;
  /** % del presupuesto que representa projectedTotal, o null si no hay budgetLimit configurado. */
  pctOfBudget: number | null;
}

/**
 * Fase 4 — deriva la proyección de cierre de mes y el disponible por día.
 * Aislado de computeBudgetOutlook (que solo agrega spent/estimated/daysLeft)
 * porque la fórmula de "al ritmo actual" es una decisión de producto, no
 * aritmética de agregación.
 */
function deriveBudgetOutlook(
  spent: number,
  estimatedMonthlyTotal: number,
  budgetLimit: number | null,
  daysLeftInMonth: number
): BudgetOutlook {
  const upcoming = Math.max(0, estimatedMonthlyTotal - spent);
  // Proyección plana (spent + upcoming), sin ponderar por días transcurridos:
  // son cuotas fijas con fecha, no consumo continuo — ponderar por días
  // inventaría una tendencia que no existe.
  const projectedTotal = spent + upcoming;

  if (budgetLimit == null || budgetLimit <= 0) {
    return { spent, upcoming, projectedTotal, remaining: 0, perDay: 0, pctOfBudget: null };
  }

  // remaining se calcula sobre spent, no sobre projectedTotal: "puedes gastar
  // por día" responde "con lo que ya salió de mi cuenta, cuánto me queda" —
  // restarle lo que aún no se paga daría un número desmoralizante y falso.
  const remaining = Math.max(0, budgetLimit - spent);
  const perDay = daysLeftInMonth > 0 ? Math.floor(remaining / daysLeftInMonth) : remaining;
  const pctOfBudget = (projectedTotal / budgetLimit) * 100;

  return { spent, upcoming, projectedTotal, remaining, perDay, pctOfBudget };
}

/** Fase 4: presupuesto y proyección de cierre de mes, en `currency` (default MXN). */
export function computeBudgetOutlook(
  subscriptions: Subscription[],
  payments: PaymentRecord[],
  budgetLimit: number | null,
  ref = new Date(),
  currency = 'MXN'
): BudgetOutlook {
  const year = ref.getFullYear();
  const month = ref.getMonth();

  const spent = payments
    .filter((p) => (p.currency || 'MXN') === currency)
    .filter((p) => {
      const d = new Date(p.paid_at);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((sum, p) => sum + p.amount, 0);

  const estimatedMonthlyTotal = computeMonthlyTotal(
    subscriptions.filter((s) => (s.currency || 'MXN') === currency),
    ref
  );

  const daysLeftInMonth = lastDayOfMonth(year, month) - ref.getDate() + 1;

  return deriveBudgetOutlook(spent, estimatedMonthlyTotal, budgetLimit, daysLeftInMonth);
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

function isWithinRange(iso: string, range: CategoryRange, ref: Date): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const monthsAgo = (ref.getFullYear() - d.getFullYear()) * 12 + (ref.getMonth() - d.getMonth());
  return range === 'month' ? monthsAgo === 0 : monthsAgo >= 0 && monthsAgo <= 2;
}

/** Fase 4: totales de pagos reales por categoría, agrupados sobre `range` ('month' = mes en curso, 'quarter' = este mes y los 2 anteriores). */
export function computeCategoryTotals(
  subscriptions: Subscription[],
  payments: PaymentRecord[],
  range: CategoryRange,
  ref = new Date()
): CategoryTotal[] {
  const categoryBySubId = new Map<string, string>();
  for (const s of subscriptions) {
    categoryBySubId.set(s.id, s.category?.trim() || UNCATEGORIZED_LABEL);
  }

  const buckets = new Map<
    string,
    { total: number; payments: { name: string; amount: number; paid_at: string }[] }
  >();

  for (const p of payments) {
    if (!isWithinRange(p.paid_at, range, ref)) continue;
    const category = categoryBySubId.get(p.subscription_id) ?? UNCATEGORIZED_LABEL;
    if (!buckets.has(category)) buckets.set(category, { total: 0, payments: [] });
    const bucket = buckets.get(category)!;
    bucket.total += p.amount;
    bucket.payments.push({
      name: p.subscription_name ?? 'Pago',
      amount: p.amount,
      paid_at: p.paid_at,
    });
  }

  const grandTotal = Array.from(buckets.values()).reduce((sum, b) => sum + b.total, 0) || 1;

  return Array.from(buckets.entries())
    .map(([category, b]) => ({
      category,
      total: b.total,
      count: b.payments.length,
      avg: b.total / b.payments.length,
      pct: (b.total / grandTotal) * 100,
      payments: b.payments.sort((a, b2) => b2.paid_at.localeCompare(a.paid_at)),
    }))
    .sort((a, b) => b.total - a.total);
}

export interface PriceIncrease {
  name: string;
  before: number;
  after: number;
  diff: number;
  pct: number;
}

function monthKey(ref: Date, offset: number): { year: number; month: number } {
  const d = new Date(ref.getFullYear(), ref.getMonth() + offset, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function amountsByName(
  payments: PaymentRecord[],
  year: number,
  month: number
): Map<string, number[]> {
  const byName = new Map<string, number[]>();
  for (const p of payments) {
    const d = new Date(p.paid_at);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const name = p.subscription_name ?? 'Pago';
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(p.amount);
  }
  return byName;
}

/**
 * Fase 4 — "Subieron de precio": top 3 nombres cuyo pago de este mes costó
 * más que el mes anterior. thisMonth/lastMonth ya vienen agrupados por
 * nombre (mecánico); cómo colapsar varios pagos del mismo nombre en un solo
 * "antes"/"ahora" comparable es la parte de criterio de producto.
 */
function topPriceIncreases(
  thisMonth: Map<string, number[]>,
  lastMonth: Map<string, number[]>
): PriceIncrease[] {
  const increases: PriceIncrease[] = [];

  for (const [name, afterAmounts] of thisMonth) {
    const beforeAmounts = lastMonth.get(name);
    if (!beforeAmounts || beforeAmounts.length === 0) continue;

    const before = beforeAmounts.reduce((sum, amount) => sum + amount, 0);
    const after = afterAmounts.reduce((sum, amount) => sum + amount, 0);
    if (before <= 0) continue;

    const diff = after - before;
    if (diff <= 0) continue;

    increases.push({ name, before, after, diff, pct: (diff / before) * 100 });
  }

  return increases.sort((a, b) => b.diff - a.diff).slice(0, 3);
}

/** Fase 4: compara cada pago de este mes con el mismo nombre el mes anterior. */
export function computePriceIncreases(
  payments: PaymentRecord[],
  ref = new Date()
): PriceIncrease[] {
  const current = monthKey(ref, 0);
  const previous = monthKey(ref, -1);
  const thisMonth = amountsByName(payments, current.year, current.month);
  const lastMonth = amountsByName(payments, previous.year, previous.month);
  return topPriceIncreases(thisMonth, lastMonth);
}

export interface MonthComparison {
  thisTotal: number;
  lastTotal: number;
  diff: number;
  pct: number | null;
  note: string;
}

/** Fase 4: total de este mes vs el anterior, con una nota en lenguaje natural. */
export function computeMonthComparison(
  payments: PaymentRecord[],
  ref = new Date()
): MonthComparison {
  const current = monthKey(ref, 0);
  const previous = monthKey(ref, -1);
  const sum = (year: number, month: number) =>
    payments
      .filter((p) => {
        const d = new Date(p.paid_at);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .reduce((total, p) => total + p.amount, 0);

  const thisTotal = sum(current.year, current.month);
  const lastTotal = sum(previous.year, previous.month);
  const diff = thisTotal - lastTotal;
  const pct = lastTotal > 0 ? (diff / lastTotal) * 100 : null;

  const monthLabel = new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(
    new Date(previous.year, previous.month, 1)
  );
  const note =
    lastTotal === 0
      ? 'Sin pagos el mes pasado para comparar.'
      : diff > 0
        ? `Gastaste ${Math.abs(Math.round(pct ?? 0))}% más que ${monthLabel}.`
        : diff < 0
          ? `Gastaste ${Math.abs(Math.round(pct ?? 0))}% menos que ${monthLabel}.`
          : `Gastaste igual que ${monthLabel}.`;

  return { thisTotal, lastTotal, diff, pct, note };
}
