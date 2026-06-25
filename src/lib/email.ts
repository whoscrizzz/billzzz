export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Permissive validation — avoids Safari rejecting valid addresses (e.g. with _). */
export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (normalized.length < 5 || normalized.length > 254) return false;
  const at = normalized.indexOf("@");
  if (at < 1 || at === normalized.length - 1) return false;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!local || !domain.includes(".")) return false;
  if (/\s/.test(normalized)) return false;
  return true;
}

export function emailValidationMessage(email: string): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return "Escribe tu correo electrónico";
  if (!isValidEmail(normalized)) {
    return "Correo inválido. Ejemplo: tu@correo.com";
  }
  return null;
}
