/** Parse due_dates column (JSON string or array) and legacy due_date. */
export function parseDueDates(sub: {
  due_dates?: string | string[] | null;
  due_date?: string | null;
}): string[] {
  if (sub.due_dates) {
    if (Array.isArray(sub.due_dates)) {
      return sub.due_dates.filter(isValidIso).sort();
    }
    try {
      const parsed = JSON.parse(sub.due_dates) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((d): d is string => typeof d === 'string' && isValidIso(d)).sort();
      }
    } catch {
      /* ignore */
    }
  }
  if (sub.due_date && isValidIso(sub.due_date)) return [sub.due_date];
  return [];
}

export function serializeDueDates(dates: string[]): string | null {
  const clean = [...new Set(dates.filter(isValidIso))].sort();
  if (clean.length === 0) return null;
  return JSON.stringify(clean);
}

export function isValidIso(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function nearestDueFromList(dates: string[], from = new Date()): string | null {
  if (dates.length === 0) return null;
  const todayTs = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  let bestFuture: string | null = null;
  let bestFutureDays = Infinity;
  let bestPast: string | null = null;
  let bestPastDays = -Infinity;

  for (const iso of dates) {
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

export function removeDueDate(dates: string[], toRemove: string): string[] {
  return dates.filter((d) => d !== toRemove).sort();
}

function parseIsoDateUtc(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
