import { loadRoundCents } from './ui-prefs';

/** Formato de moneda global — respeta la preferencia "Redondear centavos" (Ajustes).
 *  `currencyDisplay` por defecto usa el símbolo normal (Intl escribe "USD" en vez de
 *  "$" para monedas no locales en es-MX) — pasar 'narrowSymbol' solo donde la moneda
 *  ya se etiqueta aparte (ej. hero-currency-tag) y el código repetido sería redundante. */
export function formatMoney(
  amount: number,
  currency: string,
  currencyDisplay: 'symbol' | 'narrowSymbol' = 'symbol'
): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    currencyDisplay,
    maximumFractionDigits: loadRoundCents() ? 0 : 2,
  }).format(amount);
}

/** Variante compacta para espacios chicos (badges, centro de dona): sin decimales a partir de 1000, sin importar la preferencia. */
export function formatMoneyCompact(amount: number, currency: string): string {
  if (Math.abs(amount) >= 1000) {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return formatMoney(amount, currency);
}
