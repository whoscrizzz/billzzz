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
