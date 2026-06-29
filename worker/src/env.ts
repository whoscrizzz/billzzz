export interface Env {
  // Mantener alineado con wrangler.jsonc; verificar con: npm run cf-typegen
  DB: D1Database;
  ASSETS: Fetcher;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  APP_URL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  APP_VERSION: string;
  API_VERSION: string;
}

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

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
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

export function appOrigin(env: Env, request: Request): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, '');
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
