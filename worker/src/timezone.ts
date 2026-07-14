/** IANA zone used for push/calendar notify_hour (local wall clock). */
export const NOTIFY_TIMEZONE = 'America/Mexico_City';

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
