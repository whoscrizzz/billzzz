// Generado por wrangler a partir de wrangler.jsonc — no lo edites a mano.
// Tras cambiar bindings: npm run cf-typegen (ver worker-configuration.d.ts, gitignored).
export type Env = Cloudflare.Env;

export type Frequency = 'weekly' | 'monthly' | 'yearly' | 'once';

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
  category: string | null;
  notes: string | null;
  notify_days_before: number;
  notify_hour: number;
  snoozed_until: string | null;
  last_paid_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  budget_limit: number | null;
  email_reminders: number;
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

export function error(message: string, status = 400): Response {
  return Response.json({ error: message }, { status, headers: corsHeaders });
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
