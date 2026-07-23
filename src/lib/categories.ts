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
