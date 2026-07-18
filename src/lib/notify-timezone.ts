export const NOTIFY_TIMEZONE = 'America/Mexico_City';

/**
 * Curated allowlist of IANA zones a user can pick in Ajustes as their notify
 * timezone. Keep in sync with worker/src/timezone.ts's copy on the backend
 * (worker and SPA are separate bundles, no shared import).
 */
export const SUPPORTED_TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/Mexico_City', label: 'Ciudad de México' },
  { value: 'America/Tijuana', label: 'Tijuana' },
  { value: 'America/Cancun', label: 'Cancún' },
  { value: 'America/Monterrey', label: 'Monterrey' },
  { value: 'America/Bogota', label: 'Bogotá' },
  { value: 'America/Lima', label: 'Lima' },
  { value: 'America/Santiago', label: 'Santiago' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
  { value: 'America/New_York', label: 'Nueva York' },
  { value: 'America/Chicago', label: 'Chicago' },
  { value: 'America/Denver', label: 'Denver' },
  { value: 'America/Los_Angeles', label: 'Los Ángeles' },
  { value: 'Europe/Madrid', label: 'Madrid' },
];

export function getTimezoneLabel(timezone: string): string {
  return SUPPORTED_TIMEZONES.find((t) => t.value === timezone)?.label ?? timezone;
}
