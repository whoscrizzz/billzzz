// Generado por wrangler a partir de wrangler.jsonc — no lo edites a mano.
// Tras cambiar bindings: npm run cf-typegen (ver worker-configuration.d.ts, gitignored).
// Secretos (VAPID_PRIVATE_KEY, RESEND_API_KEY) no están en wrangler.jsonc; se inyectan
// en runtime vía .dev.vars / wrangler secret put y pueden faltar en el Env generado (p. ej. CI).
export type Env = Cloudflare.Env & {
  VAPID_PRIVATE_KEY?: string;
  RESEND_API_KEY?: string;
  ACTION_TOKEN_SECRET?: string;
};

export type Frequency = 'weekly' | 'monthly' | 'yearly' | 'once' | 'interval';

/** Unidad del intervalo para frequency 'interval' (p. ej. cada 15 'day'). */
export type IntervalUnit = 'day' | 'week' | 'month';

export interface SubscriptionRow {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  due_day: number;
  frequency: Frequency;
  due_date: string | null;
  due_dates: string | null;
  /** Patrón perpetuo de varios días del mes (p. ej. [1, 15]) — JSON crudo. */
  due_days: string | null;
  interval_count: number | null;
  interval_unit: IntervalUnit | null;
  category: string | null;
  notes: string | null;
  notify_days_before: number;
  notify_hour: number;
  snoozed_until: string | null;
  last_paid_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  trashed_at: string | null;
}

export interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  budget_limit: number | null;
  email_reminders: number;
  timezone: string;
  action_token_version: number;
  /** 1 = acceso revocado sin borrar datos (ver migración 0017). */
  disabled: number;
  created_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function makeCorsHeaders(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const appUrl = env.APP_URL?.replace(/\/$/, '') ?? '';
  const allowed =
    appUrl && origin === appUrl
      ? origin
      : origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')
        ? origin
        : appUrl || '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

// Kept for OPTIONS pre-flight and export (no request context available there)
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function json(data: unknown, status = 200, request?: Request, env?: Env): Response {
  const headers = request && env ? makeCorsHeaders(env, request) : corsHeaders;
  return Response.json(data, { status, headers });
}

export function error(message: string, status = 400, request?: Request, env?: Env): Response {
  const headers = request && env ? makeCorsHeaders(env, request) : corsHeaders;
  return Response.json({ error: message }, { status, headers });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (normalized.length < 5 || normalized.length > 254) return false;
  const at = normalized.indexOf('@');
  if (at < 1 || at === normalized.length - 1) return false;
  const domain = normalized.slice(at + 1);
  if (!domain.includes('.')) return false;
  if (/\s/.test(normalized)) return false;
  return true;
}

/** True if a D1 write failed because it violated a UNIQUE constraint. */
export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

/** Structured JSON error log — searchable/filterable in Workers Observability. */
export function logError(message: string, err: unknown, context?: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      message,
      error: err instanceof Error ? err.message : String(err),
      ...context,
    })
  );
}

export function appOrigin(env: Env, request: Request): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, '');
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
