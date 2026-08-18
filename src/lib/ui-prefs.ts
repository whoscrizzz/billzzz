import { CATEGORIES } from './categories';
import type { ListLayout, SortMode } from '../types/subscription';

const LAYOUT_KEY = 'bills-list-layout';
const SORT_KEY = 'bills-sort';
const LOGIN_EMAIL_KEY = 'bills-login-email';
const SIDEBAR_COLLAPSED_KEY = 'bills-sidebar-collapsed';
const ROUND_CENTS_KEY = 'bills-round-cents';
const START_SCREEN_KEY = 'bills-start-screen';
const CUSTOM_CATEGORIES_KEY = 'bills-custom-categories';

export function loadListLayout(): ListLayout {
  const v = localStorage.getItem(LAYOUT_KEY);
  return v === 'flat' ? 'flat' : 'category';
}

export function saveListLayout(layout: ListLayout): void {
  localStorage.setItem(LAYOUT_KEY, layout);
}

export function loadSortMode(): SortMode {
  const v = localStorage.getItem(SORT_KEY);
  if (v === 'amount-desc' || v === 'amount-asc' || v === 'name' || v === 'due') return v;
  return 'due';
}

export function saveSortMode(sort: SortMode): void {
  localStorage.setItem(SORT_KEY, sort);
}

export function loadLoginEmail(): string {
  return localStorage.getItem(LOGIN_EMAIL_KEY) ?? '';
}

export function saveLoginEmail(email: string): void {
  localStorage.setItem(LOGIN_EMAIL_KEY, email);
}

export function loadSidebarCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
}

/** Alterna el formateo global de montos entre 2 decimales (default) y 0 (redondeado). */
export function loadRoundCents(): boolean {
  return localStorage.getItem(ROUND_CENTS_KEY) === '1';
}

export function saveRoundCents(roundCents: boolean): void {
  localStorage.setItem(ROUND_CENTS_KEY, roundCents ? '1' : '0');
}

/** Fase 7a: pantalla de arranque. 'resumen' abre la vista de captura
 *  (`#/resumen`) en vez de Inicio — el sustituto del widget que iOS no
 *  permite desde una PWA. */
export type StartScreen = 'home' | 'summary';

export function loadStartScreen(): StartScreen {
  return localStorage.getItem(START_SCREEN_KEY) === 'summary' ? 'summary' : 'home';
}

export function saveStartScreen(screen: StartScreen): void {
  localStorage.setItem(START_SCREEN_KEY, screen);
}

/** Categorías escritas a mano en RegisterPanel que no están en CATEGORIES. */
export function loadCustomCategories(): string[] {
  const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

/** Tope de categorías personalizadas a recordar — suficiente para no perder
 *  las que usa seguido sin dejar que la lista crezca sin límite. */
const MAX_CUSTOM_CATEGORIES = 12;

/**
 * Agrega `name` a las categorías personalizadas y persiste. Orden: más
 * reciente primero — en RegisterPanel se muestran después de CATEGORIES, así
 * que la que acabas de escribir queda al frente de ese tramo en vez de
 * enterrarse al fondo cuando ya hay varias.
 */
export function addCustomCategory(name: string): string[] {
  const trimmed = name.trim();
  const current = loadCustomCategories();
  if (!trimmed) return current;

  const normalized = trimmed.toLowerCase();
  const exists =
    CATEGORIES.some((c) => c.toLowerCase() === normalized) ||
    current.some((c) => c.toLowerCase() === normalized);
  if (exists) return current;

  const next = [trimmed, ...current].slice(0, MAX_CUSTOM_CATEGORIES);
  try {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

const SEARCH_EXPANDED_KEY = 'bills-search-expanded';

/** Búsqueda/filtros de Inicio, colapsados por defecto (vista minimalista). */
export function loadSearchExpanded(): boolean {
  return localStorage.getItem(SEARCH_EXPANDED_KEY) === '1';
}

export function saveSearchExpanded(expanded: boolean): void {
  localStorage.setItem(SEARCH_EXPANDED_KEY, expanded ? '1' : '0');
}
