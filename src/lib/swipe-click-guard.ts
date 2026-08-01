let suppressUntil = 0;

/** Llamar al soltar un swipe horizontal — evita que el click sintético que el
 * navegador dispara tras el gesto táctil active el botón que quedó debajo del
 * dedo (p. ej. reabrir el detalle o, peor, confirmar un diálogo recién montado). */
export function armClickSuppression(ms = 400) {
  suppressUntil = Date.now() + ms;
}

export function isClickSuppressed() {
  return Date.now() < suppressUntil;
}
