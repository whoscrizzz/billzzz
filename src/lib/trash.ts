export const TRASH_RETENTION_DAYS = 30;

/** Días restantes antes de que la papelera purgue el registro para siempre. */
export function daysRemainingInTrash(trashedAt: string, now = new Date()): number {
  const elapsedDays = (now.getTime() - new Date(trashedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsedDays));
}
