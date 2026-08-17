/** API prefix — intentionally NOT `/api/` to avoid zone WAF on whoscrizzz.com production. */
export const API_PREFIX = '/bills-api';

/**
 * Stage 1 of the billzzz-api rename: `/billzzz-api` is accepted alongside the canonical
 * `/bills-api` (routes.ts normalizes to API_PREFIX before dispatch), so nothing else in
 * the worker needs to know about the second prefix. The client keeps calling
 * `/bills-api/` until stage 2 confirms the zone WAF doesn't block the new prefix.
 */
export const API_PREFIXES = [API_PREFIX, '/billzzz-api'] as const;
