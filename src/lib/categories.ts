export const CATEGORIES = [
  'Suscripciones',
  'Servicios',
  'Préstamos',
  'Educación',
  'Personal',
  'Casa',
  'Auto',
  'Salud',
  'Entretenimiento',
  'Seguros',
  'Otros',
] as const;

export type Category = (typeof CATEGORIES)[number];

export function suggestCategories(query: string, existing: string[]): string[] {
  const q = query.trim().toLowerCase();
  const pool = new Set<string>([...CATEGORIES, ...existing.filter(Boolean)]);
  const list = Array.from(pool);
  if (!q) return list.slice(0, 8);
  return list.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
}
