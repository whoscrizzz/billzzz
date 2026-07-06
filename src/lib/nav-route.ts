import type { NavPage } from '../types/nav';

const VALID_PAGES: NavPage[] = ['home', 'add', 'calendar', 'settings'];

function isNavPage(value: string | null): value is NavPage {
  return value !== null && (VALID_PAGES as string[]).includes(value);
}

/** Read dashboard tab from `?p=` or legacy paths. */
export function readNavPageFromLocation(): NavPage {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('p');
  if (isNavPage(fromQuery)) return fromQuery;

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/settings' || path === '/ajustes') return 'settings';
  if (path === '/add' || path === '/registrar') return 'add';
  if (path === '/calendar' || path === '/calendario') return 'calendar';
  return 'home';
}

/** Keep shareable URLs without full router: `/?p=settings` on home. */
export function writeNavPageToLocation(page: NavPage): void {
  if (window.location.pathname === '/auth/verify') return;

  const url = new URL(window.location.href);
  url.pathname = '/';
  if (page === 'home') {
    url.searchParams.delete('p');
  } else {
    url.searchParams.set('p', page);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.history.replaceState({ navPage: page }, '', next);
  }
}
