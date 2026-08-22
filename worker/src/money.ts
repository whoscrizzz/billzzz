export type SupportedCurrency = 'MXN' | 'USD';

const MINOR_FACTOR = 100;
const FX_FACTOR = 1_000_000;
const FLOAT_TOLERANCE = 1e-7;

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return value === 'MXN' || value === 'USD';
}

/** Convierte unidades mayores del API a centavos sin aceptar fracciones ocultas. */
export function toMinorUnits(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const scaled = value * MINOR_FACTOR;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > FLOAT_TOLERANCE) return null;
  return rounded;
}

export function fromMinorUnits(value: number): number {
  return value / MINOR_FACTOR;
}

/** El FX es una razón aproximada, pero se congela con seis decimales deterministas. */
export function toFxMicros(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  const scaled = value * FX_FACTOR;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > FLOAT_TOLERANCE) return null;
  return rounded;
}

export function fromFxMicros(value: number): number {
  return value / FX_FACTOR;
}
