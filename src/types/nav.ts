import type { NavIconName } from '../components/NavIcon';

export type NavPage = 'home' | 'add' | 'calendar' | 'notes' | 'settings';

// 'add' se quitó del bottom-nav: ya no es una página completa, es la hoja
// modal que abre el FAB (ver AddFab.tsx) — pero sigue siendo un NavPage
// válido para compatibilidad con enlaces viejos (/add, /registrar, ?p=add),
// interceptado en App.tsx apenas se resuelve al cargar.
export const NAV_ITEMS: { id: NavPage; label: string; icon: NavIconName }[] = [
  { id: 'home', label: 'Inicio', icon: 'home' },
  { id: 'calendar', label: 'Calendario', icon: 'calendar' },
  { id: 'notes', label: 'Facturas', icon: 'notes' },
  { id: 'settings', label: 'Ajustes', icon: 'settings' },
];
