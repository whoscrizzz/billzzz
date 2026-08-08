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

/**
 * Tono fijo por categoría. Viene del handoff de diseño, que pide sustituir el
 * hash original porque «da colores impredecibles y repetidos»: dos categorías
 * distintas podían caer en el mismo tono, y el tono cambiaba si se renombraba
 * la categoría.
 *
 * `Préstamos` no está en la tabla del handoff (su mock tenía 9 categorías, el
 * repo tiene 11) — se le asigna 85, el hueco más ancho entre Educación 45 y
 * Salud 145. `Otros` queda fuera a propósito: es un cajón de sastre, no una
 * categoría real, y se resuelve en `categoryColor`.
 */
const CATEGORY_HUES: Record<string, number> = {
  Casa: 172,
  Servicios: 205,
  Entretenimiento: 300,
  Salud: 145,
  Auto: 25,
  Suscripciones: 258,
  Seguros: 190,
  Educación: 45,
  Personal: 330,
  Préstamos: 85,
};

/** Saturación y luminosidad del handoff. Únicos valores válidos para categorías. */
const CATEGORY_SAT = 62;
const CATEGORY_LUM = 52;

/** Etiquetas que no son una categoría real, sino la ausencia de una. */
const NEUTRAL_LABELS = new Set(['Otros', 'Sin categoría']);

/**
 * Gris de baja saturación para NEUTRAL_LABELS. Sin tono (el `240` es
 * arbitrario, lo que importa es la saturación baja) para no competir
 * visualmente con el resto de la paleta ni leerse como una categoría más —
 * y funciona igual en claro y oscuro porque no depende de un hue que haya
 * que invertir por tema.
 */
const NEUTRAL_COLOR = 'hsl(240 6% 55%)';

/**
 * Tono estable para una categoría fuera de la tabla. La categoría es texto
 * libre (ver el input con `datalist` de RegisterPanel), así que siempre puede
 * llegar algo que no esté en `CATEGORY_HUES`.
 */
function hashHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function categoryHue(category: string): number {
  const key = category.trim();
  return CATEGORY_HUES[key] ?? hashHue(key);
}

/**
 * Color CSS de una categoría. Es la única forma válida de pintar un punto,
 * barra o celda por categoría: si cada llamador arma su propio `hsl()`, la
 * saturación se desincroniza entre pantallas (fue exactamente lo que pasó
 * antes de centralizar esto).
 */
export function categoryColor(category: string): string {
  const key = category.trim();
  // Vacío cuenta como neutral aunque no sea literalmente 'Sin categoría': los
  // call sites ya normalizan con `?.trim() || UNCATEGORIZED_LABEL` antes de
  // llegar acá, pero si alguno se les olvida, un string vacío no debe caer en
  // hashHue('') (siempre el mismo hue 0, un rojo saturado sin significado).
  if (!key || NEUTRAL_LABELS.has(key)) return NEUTRAL_COLOR;
  return `hsl(${categoryHue(key)} ${CATEGORY_SAT}% ${CATEGORY_LUM}%)`;
}
