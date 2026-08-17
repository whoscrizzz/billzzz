/**
 * API prefix — intentionally NOT `/api/` to avoid zone WAF on whoscrizzz.com production.
 * Renamed from `/bills-api` to `/billzzz-api` (stage 1 verified the WAF doesn't block
 * it; stage 2 cut over and retired `/bills-api` entirely).
 */
export const API_PREFIX = '/billzzz-api';
