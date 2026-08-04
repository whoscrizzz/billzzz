import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

const THEME_KEY = 'bills-theme';

export function loadTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto';
}

export function saveTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
}

/* Fondo de la barra de estado en la PWA instalada. Coincide con el fondo de
   .topbar (rgba(24,24,24,.86) en oscuro, rgba(255,255,255,.92) en claro) para
   que no se vea una franja de otro color arriba del topbar. */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: '#181818',
  light: '#f2f2f7',
};

function applyResolvedTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
  // index.html declara una meta por esquema (media="(prefers-color-scheme: …)").
  // Se pisan las dos con el tema ya resuelto: así la que matchee el sistema
  // devuelve el color correcto aunque el usuario haya forzado el otro tema.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', THEME_COLOR[resolved]);
  });
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', resolved);
}

export function useTheme(): {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => loadTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(loadTheme())
  );

  // Aplica el tema resuelto cada vez que cambia la preferencia o el modo del sistema.
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyResolvedTheme(resolved);
  }, [theme]);

  // Solo en 'auto': seguir al sistema.
  useEffect(() => {
    if (theme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      const resolved: ResolvedTheme = e.matches ? 'dark' : 'light';
      setResolvedTheme(resolved);
      applyResolvedTheme(resolved);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    saveTheme(next);
    setThemeState(next);
  }, []);

  return { theme, resolvedTheme, setTheme };
}
