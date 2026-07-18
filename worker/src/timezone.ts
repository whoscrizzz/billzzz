/** IANA zone used for push/calendar notify_hour (local wall clock). */
export const NOTIFY_TIMEZONE = 'America/Mexico_City';

/**
 * Curated allowlist of IANA zones a user can pick in Ajustes as their notify
 * timezone. Keep in sync with src/lib/notify-timezone.ts's copy on the
 * frontend (worker and SPA are separate bundles, no shared import).
 */
export const SUPPORTED_TIMEZONES = [
  'America/Mexico_City',
  'America/Tijuana',
  'America/Cancun',
  'America/Monterrey',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/Madrid',
] as const;

export function isValidTimezone(value: string): boolean {
  return (SUPPORTED_TIMEZONES as readonly string[]).includes(value);
}

export function getHourInTimeZone(date: Date, timeZone: string = NOTIFY_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour');
  return hourPart ? parseInt(hourPart.value, 10) : date.getUTCHours();
}

/**
 * Midnight-UTC timestamp of `date`'s calendar day as it appears in `timeZone`.
 * Used as the "today" anchor for day-math so it agrees with getHourInTimeZone's
 * notion of "today" — otherwise the two can disagree by a day during the hours
 * when the UTC calendar date and the local calendar date differ.
 */
export function getDateInTimeZone(date: Date, timeZone: string = NOTIFY_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return Date.UTC(year, month - 1, day);
}
