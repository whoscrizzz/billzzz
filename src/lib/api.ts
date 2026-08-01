import { clearSession, getSessionToken } from './auth';
import { handleUnauthorizedSession } from './session-events';
import { API_PREFIX } from './constants';
import type { UserSettings } from '../types/subscription';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

const API_BASE = '';

/**
 * Thrown on a non-ok API response. Carries the HTTP status so callers (e.g.
 * the offline-sync queue in useSubscriptions) can tell a permanent rejection
 * (4xx — validation, not found) apart from a transient failure worth queuing
 * for retry (network error, 5xx).
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function publicFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
  }
  return response;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getSessionToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (response.status === 401) {
    handleUnauthorizedSession();
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
  }

  return response;
}

export async function requestMagicLink(email: string) {
  const res = await fetch(`${API_BASE}${API_PREFIX}/auth/request-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const raw = await res.text();
  let data: { error?: string; message?: string; verifyUrl?: string; shortCode?: string };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error(
      res.status === 403
        ? 'La petición fue bloqueada. Recarga la página e intenta de nuevo.'
        : 'No se pudo conectar. Recarga la página e intenta de nuevo.'
    );
  }

  if (!res.ok) throw new Error(data.error ?? 'No se pudo enviar el enlace');
  return data as { message?: string; verifyUrl?: string; shortCode?: string };
}

export async function verifyMagicLink(token: string) {
  const res = await fetch(`${API_BASE}${API_PREFIX}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = (await res.json()) as {
    error?: string;
    token?: string;
    user?: { id: string; email: string };
  };
  if (!res.ok) throw new Error(data.error ?? 'Enlace inválido');
  return data as { token: string; user: { id: string; email: string } };
}

export async function verifyWithCode(email: string, code: string) {
  const res = await fetch(`${API_BASE}${API_PREFIX}/auth/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const data = (await res.json()) as {
    error?: string;
    token?: string;
    user?: { id: string; email: string };
  };
  if (!res.ok) throw new Error(data.error ?? 'Código inválido');
  return data as { token: string; user: { id: string; email: string } };
}

export async function fetchMe() {
  const res = await apiFetch(`${API_PREFIX}/auth/me`);
  return res.json() as Promise<{ user: { id: string; email: string | null } }>;
}

export async function logout() {
  try {
    await apiFetch(`${API_PREFIX}/auth/logout`, { method: 'POST' });
  } finally {
    clearSession();
  }
}

export async function fetchPasskeyLoginOptions() {
  const res = await publicFetch(`${API_PREFIX}/auth/passkey/login/options`, { method: 'POST' });
  return res.json() as Promise<{
    options: PublicKeyCredentialRequestOptionsJSON;
    challengeId: string;
  }>;
}

export async function verifyPasskeyLogin(
  challengeId: string,
  response: AuthenticationResponseJSON
) {
  const res = await publicFetch(`${API_PREFIX}/auth/passkey/login/verify`, {
    method: 'POST',
    body: JSON.stringify({ challengeId, response }),
  });
  return res.json() as Promise<{ token: string; user: { id: string; email: string } }>;
}

export async function fetchPasskeyRegisterOptions() {
  const res = await apiFetch(`${API_PREFIX}/auth/passkey/register/options`, { method: 'POST' });
  return res.json() as Promise<{
    options: PublicKeyCredentialCreationOptionsJSON;
    challengeId: string;
  }>;
}

export async function verifyPasskeyRegister(
  challengeId: string,
  response: RegistrationResponseJSON,
  deviceName?: string
) {
  const res = await apiFetch(`${API_PREFIX}/auth/passkey/register/verify`, {
    method: 'POST',
    body: JSON.stringify({ challengeId, response, deviceName }),
  });
  return res.json() as Promise<{ ok: true; passkey: { id: string; device_name: string } }>;
}

export async function fetchPasskeys() {
  const res = await apiFetch(`${API_PREFIX}/auth/passkey/credentials`);
  return res.json() as Promise<{
    passkeys: {
      id: string;
      device_name: string;
      created_at: string;
      last_used_at: string | null;
      backed_up: boolean;
    }[];
  }>;
}

export async function deletePasskeyCredential(id: string, revokeOtherSessions = false) {
  const res = await apiFetch(`${API_PREFIX}/auth/passkey/credentials/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ revokeOtherSessions }),
  });
  return res.json() as Promise<{ ok: true; revoked: number }>;
}

export async function revokeOtherSessions() {
  const res = await apiFetch(`${API_PREFIX}/auth/sessions/revoke-others`, { method: 'POST' });
  return res.json() as Promise<{ ok: true; revoked: number }>;
}

export async function fetchSessions() {
  const res = await apiFetch(`${API_PREFIX}/auth/sessions`);
  return res.json() as Promise<{
    sessions: {
      id: string;
      device_name: string;
      ip: string | null;
      created_at: string;
      expires_at: string;
      is_current: boolean;
    }[];
  }>;
}

export async function revokeSession(id: string) {
  const res = await apiFetch(`${API_PREFIX}/auth/sessions/${id}`, { method: 'DELETE' });
  return res.json() as Promise<{ ok: true }>;
}

export async function fetchSubscriptions() {
  const res = await apiFetch(`${API_PREFIX}/subscriptions`);
  return res.json() as Promise<{ subscriptions: import('../types/subscription').Subscription[] }>;
}

export async function createSubscription(data: import('../types/subscription').SubscriptionInput) {
  const res = await apiFetch(`${API_PREFIX}/subscriptions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json() as Promise<{ id: string }>;
}

export async function updateSubscription(
  id: string,
  data: Partial<import('../types/subscription').SubscriptionInput>
) {
  await apiFetch(`${API_PREFIX}/subscriptions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSubscription(id: string) {
  await apiFetch(`${API_PREFIX}/subscriptions/${id}`, { method: 'DELETE' });
}

export async function markSubscriptionPaid(
  id: string,
  input?: import('../types/subscription').MarkPaidInput
) {
  const res = await apiFetch(`${API_PREFIX}/subscriptions/${id}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
  });
  return res.json() as Promise<{
    ok: true;
    paid_at: string;
    archived: boolean;
    subscription?: {
      due_date: string | null;
      due_day: number;
      due_dates: string | null;
      snoozed_until: null;
      last_paid_at: string;
    };
  }>;
}

export async function snoozeSubscription(id: string, days = 3) {
  const res = await apiFetch(`${API_PREFIX}/subscriptions/${id}/snooze`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  });
  return res.json() as Promise<{ ok: true; snoozed_until: string }>;
}

export async function importData(
  subscriptions: import('../types/subscription').SubscriptionInput[]
) {
  const res = await apiFetch(`${API_PREFIX}/import`, {
    method: 'POST',
    body: JSON.stringify({ subscriptions }),
  });
  return res.json() as Promise<{ ok: true; imported: number }>;
}

export async function fetchSettings() {
  const res = await apiFetch(`${API_PREFIX}/settings`);
  return res.json() as Promise<UserSettings>;
}

export async function updateSettings(data: {
  budget_limit?: number | null;
  email_reminders?: boolean;
  timezone?: string;
  display_name?: string | null;
}) {
  const res = await apiFetch(`${API_PREFIX}/settings`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.json() as Promise<UserSettings>;
}

export async function exportData(): Promise<Blob> {
  const token = getSessionToken();
  const res = await fetch(`${API_BASE}${API_PREFIX}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('No se pudo exportar');
  return res.blob();
}

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}${API_PREFIX}/health`);
  return res.json() as Promise<{
    ok: boolean;
    version: string;
    db: boolean;
    push: boolean;
    email: boolean;
  }>;
}

export async function fetchArchivedSubscriptions() {
  const res = await apiFetch(`${API_PREFIX}/subscriptions/archived`);
  return res.json() as Promise<{ subscriptions: import('../types/subscription').Subscription[] }>;
}

export async function restoreArchivedSubscription(id: string) {
  const res = await apiFetch(`${API_PREFIX}/subscriptions/${id}/restore-archived`, {
    method: 'POST',
  });
  return res.json() as Promise<{
    ok: true;
    subscription: import('../types/subscription').Subscription;
  }>;
}

export async function fetchTrashedSubscriptions() {
  const res = await apiFetch(`${API_PREFIX}/subscriptions/trashed`);
  return res.json() as Promise<{ subscriptions: import('../types/subscription').Subscription[] }>;
}

export async function restoreTrashedSubscription(id: string) {
  const res = await apiFetch(`${API_PREFIX}/subscriptions/${id}/restore-trashed`, {
    method: 'POST',
  });
  return res.json() as Promise<{
    ok: true;
    subscription: import('../types/subscription').Subscription;
  }>;
}

export async function fetchPaymentHistory() {
  const res = await apiFetch(`${API_PREFIX}/payments`);
  return res.json() as Promise<{ payments: import('../types/subscription').PaymentRecord[] }>;
}

export async function deletePaymentRecord(id: string) {
  await apiFetch(`${API_PREFIX}/payments/${id}`, { method: 'DELETE' });
}

export async function clearPaymentHistory() {
  const res = await apiFetch(`${API_PREFIX}/payments`, { method: 'DELETE' });
  return res.json() as Promise<{ ok: true; deleted: number }>;
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}${API_PREFIX}/vapid-public-key`);
    const data = (await res.json()) as { publicKey: string };
    return data.publicKey !== 'REPLACE_WITH_VAPID_PUBLIC_KEY' ? data.publicKey : null;
  } catch {
    return null;
  }
}

export async function fetchCalendarUrls() {
  const res = await apiFetch(`${API_PREFIX}/calendar/url`);
  return res.json() as Promise<{
    subscribeUrl: string;
    webcalUrl: string;
    token: string;
  }>;
}

export async function regenerateCalendarToken() {
  await apiFetch(`${API_PREFIX}/calendar/regenerate`, { method: 'POST' });
}

export async function subscribeToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return false;

  const registration = await navigator.serviceWorker.ready;
  let subscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'InvalidStateError') {
      // Suscripción previa con otra applicationServerKey (ej. VAPID rotada) — limpiar y reintentar.
      const existing = await registration.pushManager.getSubscription();
      await existing?.unsubscribe();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } else {
      throw err;
    }
  }

  await apiFetch(`${API_PREFIX}/push/subscribe`, {
    method: 'POST',
    body: JSON.stringify(subscription.toJSON()),
  });

  return true;
}

export async function fetchPushStatus(): Promise<{ serverCount: number }> {
  const res = await apiFetch(`${API_PREFIX}/push/status`);
  return res.json() as Promise<{ serverCount: number }>;
}

export interface NotificationHealth {
  last_attempt_at: string | null;
  last_status: 'sent' | 'failed' | 'expired' | null;
  consecutive_failures: number;
}

export async function fetchNotificationHealth(): Promise<NotificationHealth> {
  const res = await apiFetch(`${API_PREFIX}/notifications/health`);
  return res.json() as Promise<NotificationHealth>;
}

export async function syncPushSubscriptionToServer(
  subscription: PushSubscriptionJSON
): Promise<void> {
  await apiFetch(`${API_PREFIX}/push/subscribe`, {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
