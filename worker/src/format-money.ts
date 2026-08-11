// Formato de moneda del lado worker (push, digest de correo, feeds .ics).
//
// Copia paralela deliberada de src/lib/format-money.ts, igual que due-dates.ts:
// worker y SPA son bundles separados sin imports compartidos. Se porta la
// lógica, no el plumbing — la copia del cliente respeta la preferencia de UI
// "Redondear centavos" (localStorage), que aquí no existe ni tendría sentido:
// el worker formatea para destinatarios que no son necesariamente el dueño de
// esa preferencia.
//
// El try/catch sí es propio del worker: el código de moneda sale de la fila de
// D1 sin validar, e Intl lanza RangeError ante un ISO 4217 inválido.

/** Formatea un monto en es-MX; ante una moneda inválida degrada a "<monto> <moneda>". */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
