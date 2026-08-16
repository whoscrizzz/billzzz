import type { Env, SubscriptionRow } from './env';
import { appOrigin, error, json } from './env';
import { API_PREFIX } from './constants';
import { nextDueIsoDate, resolveYearlyAnchor } from './due-dates';
import { resolveAmountForDate } from './due-dates-json';
import { formatMoney } from './format-money';

const WEEKDAY_BY_DUE: Record<number, string> = {
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
  7: 'SU',
};

export async function getCalendarUrls(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const token = await ensureCalendarToken(env.DB, userId);
  const origin = appOrigin(env, request);
  const feedPath = `${API_PREFIX}/calendar/feed/${token}.ics`;
  const httpsUrl = `${origin}${feedPath}`;

  return json({
    subscribeUrl: httpsUrl,
    webcalUrl: httpsUrl.replace(/^https:/, 'webcal:'),
    token,
  });
}

export async function regenerateCalendarToken(env: Env, userId: string): Promise<Response> {
  const token = crypto.randomUUID();
  await env.DB.prepare(`UPDATE users SET calendar_token = ? WHERE id = ?`)
    .bind(token, userId)
    .run();
  return json({ ok: true, token });
}

export async function serveCalendarFeed(env: Env, token: string): Promise<Response> {
  // Revoking an account also kills its feed: the URL is unauthenticated, so a disabled user
  // would otherwise keep pulling their bills indefinitely with the link they already have.
  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE calendar_token = ? AND disabled = 0`
  )
    .bind(token)
    .first<{ id: string }>();

  if (!user) return error('Calendario no encontrado', 404);

  const { results } = await env.DB.prepare(
    `SELECT * FROM subscriptions
     WHERE user_id = ? AND deleted_at IS NULL AND trashed_at IS NULL
     ORDER BY due_day ASC, name ASC`
  )
    .bind(user.id)
    .all<SubscriptionRow>();

  const ics = buildIcsFeed(results ?? []);

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bills.ics"',

      'Cache-Control': 'public, max-age=300',
    },
  });
}

async function ensureCalendarToken(db: D1Database, userId: string): Promise<string> {
  const row = await db
    .prepare(`SELECT calendar_token FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ calendar_token: string | null }>();

  if (row?.calendar_token) return row.calendar_token;

  const token = crypto.randomUUID();
  await db.prepare(`UPDATE users SET calendar_token = ? WHERE id = ?`).bind(token, userId).run();
  return token;
}

function buildIcsFeed(subs: SubscriptionRow[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Billzzz PWA//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Billzzz — Pagos',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const sub of subs) {
    lines.push(...buildEventLines(sub));
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function buildEventLines(sub: SubscriptionRow): string[] {
  const uid = `${sub.id}@bills-pwa`;
  const nextDate = nextDueIsoDate(sub);
  if (!nextDate) return [];
  const amount = resolveAmountForDate(sub, nextDate);
  const summary = escapeIcs(`${sub.name} — ${formatMoney(amount, sub.currency)}`);
  const description = escapeIcs(
    [sub.category, sub.notes].filter(Boolean).join(' · ') || 'Pago registrado en Billzzz'
  );

  const notifyHour = sub.notify_hour ?? 9;
  const dtstart = formatIcsUtcDateTime(nextDate, notifyHour, 0);
  const endHour = Math.min(notifyHour + 1, 23);
  const dtend = formatIcsUtcDateTime(nextDate, endHour, 0);

  const rrule = sub.frequency === 'once' || sub.due_dates ? null : buildRrule(sub, nextDate);

  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'TRANSP:OPAQUE',
    'STATUS:CONFIRMED',
  ];

  if (rrule) lines.push(`RRULE:${rrule}`);

  lines.push(...buildAlarmLines(summary, sub.notify_days_before));

  lines.push('END:VEVENT');
  return lines;
}

function buildAlarmLines(summary: string, daysBefore: number): string[] {
  const lines: string[] = [];

  if (daysBefore > 0) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:-P${daysBefore}D`,
      `DESCRIPTION:${summary}`,
      'END:VALARM'
    );
  }

  // Same morning at 8:45 (15 min before the 9:00 event)
  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT15M',
    `DESCRIPTION:${escapeIcs('Pago hoy — ' + unescapeIcs(summary))}`,
    'END:VALARM'
  );

  return lines;
}

function unescapeIcs(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function buildRrule(sub: SubscriptionRow, nextDate: string): string {
  switch (sub.frequency) {
    case 'monthly': {
      const day = clampDay(sub.due_day);
      if (day >= 28 && day !== Number(nextDate.slice(8, 10))) {
        return 'FREQ=MONTHLY;BYMONTHDAY=-1';
      }
      return `FREQ=MONTHLY;BYMONTHDAY=${day}`;
    }
    case 'weekly': {
      const day = WEEKDAY_BY_DUE[clampWeekday(sub.due_day)] ?? 'MO';
      return `FREQ=WEEKLY;BYDAY=${day}`;
    }
    case 'yearly': {
      const { month, day } = resolveYearlyAnchor(sub);
      return `FREQ=YEARLY;BYMONTH=${month + 1};BYMONTHDAY=${clampDay(day)}`;
    }
    case 'once':
      return '';
    case 'interval': {
      const unit = sub.interval_unit ?? 'day';
      const freqWord = unit === 'day' ? 'DAILY' : unit === 'week' ? 'WEEKLY' : 'MONTHLY';
      return `FREQ=${freqWord};INTERVAL=${sub.interval_count ?? 1}`;
    }
    default:
      throw new Error(`Unhandled frequency: ${(sub as any).frequency}`);
  }
}

function clampDay(day: number): number {
  return Math.min(Math.max(day, 1), 31);
}

function clampWeekday(day: number): number {
  return Math.min(Math.max(day, 1), 7);
}

function formatIcsUtcDateTime(isoDate: string, hour: number, minute: number): string {
  const compact = isoDate.replace(/-/g, '');
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return `${compact}T${h}${m}00Z`;
}

function formatIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}
