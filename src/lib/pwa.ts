/** True when running as home-screen PWA (iOS standalone or display-mode: standalone). */
export function isStandalonePwa(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

/** Read clipboard text (requires user gesture on iOS). */
export async function readClipboardText(): Promise<string | null> {
  if (!navigator.clipboard?.readText) return null;
  try {
    const text = await navigator.clipboard.readText();
    return text.trim() || null;
  } catch {
    return null;
  }
}

export function parseVerifyToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed, window.location.origin);
    const fromQuery = url.searchParams.get("token");
    if (fromQuery && url.pathname.endsWith("/auth/verify")) return fromQuery;
  } catch {
    // not a URL — fall through
  }

  if (/^[0-9a-f-]{36}$/i.test(trimmed)) return trimmed;
  return null;
}
