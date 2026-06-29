import type { ListLayout, SortMode } from '../types/subscription';

const LAYOUT_KEY = 'bills-list-layout';
const SORT_KEY = 'bills-sort';
const LOGIN_EMAIL_KEY = 'bills-login-email';

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
