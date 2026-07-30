import type { Env, SubscriptionRow } from './env';
import { appOrigin, error, json } from './env';
import { API_PREFIX } from './constants';
import { nextDueIsoDate, resolveYearlyAnchor } from './due-dates';
import { resolveAmountForDate } from './due-dates-json';

const WEEKDAY_BY_DUE: Record<number, string> = {
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
  7: 'SU',
};

const TZ = 'America/Mexico_City';

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
  const user = await env.DB.prepare(`SELECT id FROM users WHERE calendar_token = ?`)
    .bind(token)
    .first<{ id: string }>();

  if (!user) return error('Calendario no encontrado', 404);

  const { results } = await env.DB.prepare(
    `SELECT * FROM subscriptions
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY due_day ASC, name ASC`
  )
    .bind(user.id)
    .all<SubscriptionRow>();

  const ics = buildIcsFeed(results ?? []);

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bills.ics"',
      'Cache-Control': 'public, max-age=3600',
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
    'PRODID:-//Bills PWA//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Bills — Pagos',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    'X-WR-TIMEZONE:America/Mexico_City',
    'BEGIN:VTIMEZONE',
    'TZID:America/Mexico_City',
    'X-LIC-LOCATION:America/Mexico_City',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0600',
    'TZNAME:CST',
    'DTSTART:19701025T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0600',
    'TZOFFSETTO:-0500',
    'TZNAME:CDT',
    'DTSTART:19700405T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
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
    [sub.category, sub.notes].filter(Boolean).join(' · ') || 'Pago registrado en Bills'
  );

  const notifyHour = sub.notify_hour ?? 9;
  const dtstart = formatIcsLocalDateTime(nextDate, notifyHour, 0);
  const endHour = Math.min(notifyHour + 1, 23);
  const dtend = formatIcsLocalDateTime(nextDate, endHour, 0);
  // A subscription with explicit custom dates ("Varias fechas") isn't a fixed
  // day-of-month/week/year cycle — RRULE would generate occurrences on days
  // the user never picked. Only the single nearest custom date (already
  // resolved as `nextDate` above) belongs in the feed.
  const rrule = sub.frequency === 'once' || sub.due_dates ? null : buildRrule(sub);

  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART;TZID=${TZ}:${dtstart}`,
    `DTEND;TZID=${TZ}:${dtend}`,
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

function buildRrule(sub: SubscriptionRow): string {
  switch (sub.frequency) {
    case 'monthly':
      return `FREQ=MONTHLY;BYMONTHDAY=${clampDay(sub.due_day)}`;
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
    default: {
      const _exhaustive: never = sub.frequency;
      return _exhaustive;
    }
  }
}

function clampDay(day: number): number {
  return Math.min(Math.max(day, 1), 31);
}

function clampWeekday(day: number): number {
  return Math.min(Math.max(day, 1), 7);
}

function formatIcsLocalDateTime(isoDate: string, hour: number, minute: number): string {
  const compact = isoDate.replace(/-/g, '');
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return `${compact}T${h}${m}00`;
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

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
