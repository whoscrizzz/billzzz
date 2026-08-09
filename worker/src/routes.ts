import type { Env } from './env';
import { corsHeaders, error, json } from './env';
import { API_PREFIX } from './constants';
import { handleAssistantChat } from './assistant';
import {
  getBearerToken,
  getMe,
  getSessionUserId,
  handleAdminSendInvite,
  listSessionsHandler,
  logout,
  requestMagicLink,
  revokeOtherSessionsHandler,
  revokeSessionByIdHandler,
  verifyMagicLink,
  verifyMagicLinkCode,
} from './auth';
import {
  deletePasskey,
  listPasskeys,
  passkeyLoginOptions,
  passkeyLoginVerify,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
} from './passkeys';
import { getCalendarUrls, regenerateCalendarToken, serveCalendarFeed } from './calendar';
import { captureExpense, getCaptureToken, regenerateCaptureToken } from './capture';
import { getNotificationHealth } from './notification-health';
import {
  resolveActionAuth,
  resolveGroupActionAuth,
  undoNotificationAction,
} from './notification-actions';
import {
  clearPaymentHistory,
  createSubscription,
  deletePaymentRecord,
  trashSubscription,
  listPaymentRecords,
  listSubscriptions,
  listArchivedSubscriptions,
  listTrashedSubscriptions,
  markSubscriptionPaid,
  payAllSubscriptions,
  restoreArchivedSubscription,
  restoreTrashedSubscription,
  savePushSubscription,
  getPushSubscriptionStatus,
  snoozeSubscription,
  updateSubscription,
} from './subscriptions';
import {
  exportUserData,
  getUserSettings,
  healthCheck,
  importUserData,
  updateUserSettings,
} from './settings';
import { createNote, deleteNote, listNotes, updateNote } from './notes';
import { createReminder, deleteReminder, listReminders, updateReminder } from './reminders';

function apiPath(suffix: string): string {
  return `${API_PREFIX}${suffix}`;
}

export async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === apiPath('/health')) {
    return healthCheck(env);
  }

  const feedMatch = url.pathname.match(new RegExp(`^${API_PREFIX}/calendar/feed/([^/]+)\\.ics$`));
  if (feedMatch && request.method === 'GET') {
    return serveCalendarFeed(env, feedMatch[1]);
  }

  if (url.pathname === apiPath('/vapid-public-key') && request.method === 'GET') {
    return json({ publicKey: env.VAPID_PUBLIC_KEY });
  }

  if (url.pathname === apiPath('/auth/request-link') && request.method === 'POST') {
    return requestMagicLink(request, env);
  }

  if (url.pathname === apiPath('/auth/verify-code') && request.method === 'POST') {
    return verifyMagicLinkCode(request, env);
  }

  if (url.pathname === apiPath('/auth/verify')) {
    if (request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { token?: string };
      return verifyMagicLink(request, env, body.token ?? '');
    }
    if (request.method === 'GET') {
      return error('Usa el botón «Entrar a Bills» en la página de verificación', 405, request, env);
    }
  }

  if (url.pathname === apiPath('/auth/passkey/login/options') && request.method === 'POST') {
    return passkeyLoginOptions(request, env);
  }

  if (url.pathname === apiPath('/auth/passkey/login/verify') && request.method === 'POST') {
    return passkeyLoginVerify(request, env);
  }

  // Admin-only, secreto compartido (ADMIN_TOKEN) — la llama invite-user.mjs, no la app.
  // Va antes del gate genérico por la misma razón que /capture: no hay sesión de usuario.
  if (url.pathname === apiPath('/admin/send-invite') && request.method === 'POST') {
    return handleAdminSendInvite(request, env);
  }

  // Fase 7b: captura rápida desde Atajos/Siri. Solo X-Capture-Token, nunca
  // sesión — el Atajo no puede pasar por el login. Va antes del gate genérico
  // por la misma razón que las rutas de acción de abajo.
  if (url.pathname === apiPath('/capture') && request.method === 'POST') {
    const captureToken = request.headers.get('X-Capture-Token');
    if (!captureToken) return error('No autorizado', 401, request, env);
    return captureExpense(request, env, captureToken);
  }

  // Fase 6a: mark-paid/snooze/undo aceptan sesión normal (sin cambios) O un
  // X-Action-Token (Service Worker, sin sesión) — se resuelven antes del
  // gate genérico de abajo porque el segundo caso no tiene ninguna sesión.
  const actionTokenHeader = request.headers.get('X-Action-Token');

  // "Marcar todos" desde un push agrupado (Fase 6b) — nunca lleva sesión de
  // respaldo, es una acción exclusiva del Service Worker sobre un token que
  // ya trae la lista completa de suscripciones autorizadas.
  if (url.pathname === apiPath('/notifications/pay-all') && request.method === 'POST') {
    if (!actionTokenHeader) return error('No autorizado', 401, request, env);
    const auth = await resolveGroupActionAuth(
      actionTokenHeader,
      env.DB,
      env.ACTION_TOKEN_SECRET ?? ''
    );
    if (!auth.ok) return error('No autorizado', auth.status, request, env);
    return payAllSubscriptions(env.DB, auth.userId, auth.items);
  }

  const actionMarkPaidMatch = url.pathname.match(
    new RegExp(`^${API_PREFIX}/subscriptions/([^/]+)/mark-paid$`)
  );
  if (actionMarkPaidMatch && request.method === 'POST') {
    const id = actionMarkPaidMatch[1];
    if (actionTokenHeader) {
      const auth = await resolveActionAuth(
        actionTokenHeader,
        env.DB,
        env.ACTION_TOKEN_SECRET ?? '',
        id,
        'pay'
      );
      if (!auth.ok) return error('No autorizado', auth.status, request, env);
      return markSubscriptionPaid(request, env.DB, auth.userId, id);
    }
    const sessionUserId = await getSessionUserId(request, env);
    if (!sessionUserId) return error('Inicia sesión para continuar', 401, request, env);
    return markSubscriptionPaid(request, env.DB, sessionUserId, id);
  }

  const actionSnoozeMatch = url.pathname.match(
    new RegExp(`^${API_PREFIX}/subscriptions/([^/]+)/snooze$`)
  );
  if (actionSnoozeMatch && request.method === 'POST') {
    const id = actionSnoozeMatch[1];
    if (actionTokenHeader) {
      const auth = await resolveActionAuth(
        actionTokenHeader,
        env.DB,
        env.ACTION_TOKEN_SECRET ?? '',
        id,
        'snooze'
      );
      if (!auth.ok) return error('No autorizado', auth.status, request, env);
      return snoozeSubscription(request, env.DB, auth.userId, id);
    }
    const sessionUserId = await getSessionUserId(request, env);
    if (!sessionUserId) return error('Inicia sesión para continuar', 401, request, env);
    return snoozeSubscription(request, env.DB, sessionUserId, id);
  }

  const undoMatch = url.pathname.match(new RegExp(`^${API_PREFIX}/subscriptions/([^/]+)/undo$`));
  if (undoMatch && request.method === 'POST') {
    const id = undoMatch[1];
    const undoBody = (await request.json().catch(() => ({}))) as { notificationKey?: string };
    if (!undoBody.notificationKey) return error('notificationKey requerido', 400, request, env);

    if (actionTokenHeader) {
      const auth = await resolveActionAuth(
        actionTokenHeader,
        env.DB,
        env.ACTION_TOKEN_SECRET ?? '',
        id,
        'undo'
      );
      if (!auth.ok) return error('No autorizado', auth.status, request, env);
      return undoNotificationAction(env.DB, auth.userId, id, undoBody.notificationKey);
    }
    const sessionUserId = await getSessionUserId(request, env);
    if (!sessionUserId) return error('Inicia sesión para continuar', 401, request, env);
    return undoNotificationAction(env.DB, sessionUserId, id, undoBody.notificationKey);
  }

  const userId = await getSessionUserId(request, env);
  if (!userId) {
    return error('Inicia sesión para continuar', 401, request, env);
  }

  if (url.pathname === apiPath('/auth/passkey/register/options') && request.method === 'POST') {
    return passkeyRegisterOptions(request, env, userId);
  }

  if (url.pathname === apiPath('/auth/passkey/register/verify') && request.method === 'POST') {
    return passkeyRegisterVerify(request, env, userId);
  }

  if (url.pathname === apiPath('/auth/passkey/credentials') && request.method === 'GET') {
    return listPasskeys(env, userId);
  }

  const passkeyDeleteMatch = url.pathname.match(
    new RegExp(`^${API_PREFIX}/auth/passkey/credentials/([^/]+)$`)
  );
  if (passkeyDeleteMatch && request.method === 'DELETE') {
    const body = (await request.json().catch(() => ({}))) as { revokeOtherSessions?: boolean };
    return deletePasskey(
      env,
      userId,
      passkeyDeleteMatch[1],
      getBearerToken(request),
      body.revokeOtherSessions === true
    );
  }

  if (url.pathname === apiPath('/auth/me') && request.method === 'GET') {
    return getMe(env, userId);
  }

  if (url.pathname === apiPath('/auth/logout') && request.method === 'POST') {
    return logout(request, env);
  }

  if (url.pathname === apiPath('/auth/sessions/revoke-others') && request.method === 'POST') {
    return revokeOtherSessionsHandler(request, env, userId);
  }

  if (url.pathname === apiPath('/auth/sessions') && request.method === 'GET') {
    return listSessionsHandler(request, env, userId);
  }

  const sessionDeleteMatch = url.pathname.match(
    new RegExp(`^${API_PREFIX}/auth/sessions/([^/]+)$`)
  );
  if (sessionDeleteMatch && request.method === 'DELETE') {
    return revokeSessionByIdHandler(env, userId, sessionDeleteMatch[1]);
  }

  if (url.pathname === apiPath('/settings') && request.method === 'GET') {
    return getUserSettings(env.DB, userId);
  }

  if (url.pathname === apiPath('/settings') && request.method === 'PUT') {
    return updateUserSettings(request, env.DB, userId);
  }

  if (url.pathname === apiPath('/export') && request.method === 'GET') {
    return exportUserData(request, env, userId);
  }

  if (url.pathname === apiPath('/import') && request.method === 'POST') {
    return importUserData(request, env.DB, userId);
  }

  if (url.pathname === apiPath('/subscriptions')) {
    if (request.method === 'GET') {
      return listSubscriptions(env.DB, userId);
    }
    if (request.method === 'POST') {
      return createSubscription(request, env.DB, userId);
    }
  }

  const subMatch = url.pathname.match(new RegExp(`^${API_PREFIX}/subscriptions/([^/]+)$`));
  if (subMatch) {
    const id = subMatch[1];
    if (request.method === 'PUT') {
      return updateSubscription(request, env.DB, userId, id);
    }
    if (request.method === 'DELETE') {
      return trashSubscription(env.DB, userId, id);
    }
  }

  if (url.pathname === apiPath('/push/subscribe') && request.method === 'POST') {
    return savePushSubscription(request, env.DB, userId);
  }

  if (url.pathname === apiPath('/push/status') && request.method === 'GET') {
    return getPushSubscriptionStatus(env.DB, userId);
  }

  if (url.pathname === apiPath('/notifications/health') && request.method === 'GET') {
    return getNotificationHealth(env, userId);
  }

  if (url.pathname === apiPath('/payments') && request.method === 'GET') {
    return listPaymentRecords(env.DB, userId);
  }

  if (url.pathname === apiPath('/payments') && request.method === 'DELETE') {
    return clearPaymentHistory(env.DB, userId);
  }

  const paymentDeleteMatch = url.pathname.match(new RegExp(`^${API_PREFIX}/payments/([^/]+)$`));
  if (paymentDeleteMatch && request.method === 'DELETE') {
    return deletePaymentRecord(env.DB, userId, paymentDeleteMatch[1]);
  }

  if (url.pathname === apiPath('/subscriptions/archived') && request.method === 'GET') {
    return listArchivedSubscriptions(env.DB, userId);
  }

  const restoreArchivedMatch = url.pathname.match(
    new RegExp(`^${API_PREFIX}/subscriptions/([^/]+)/restore-archived$`)
  );
  if (restoreArchivedMatch && request.method === 'POST') {
    return restoreArchivedSubscription(env.DB, userId, restoreArchivedMatch[1]);
  }

  if (url.pathname === apiPath('/subscriptions/trashed') && request.method === 'GET') {
    return listTrashedSubscriptions(env.DB, userId);
  }

  const restoreTrashedMatch = url.pathname.match(
    new RegExp(`^${API_PREFIX}/subscriptions/([^/]+)/restore-trashed$`)
  );
  if (restoreTrashedMatch && request.method === 'POST') {
    return restoreTrashedSubscription(env.DB, userId, restoreTrashedMatch[1]);
  }

  if (url.pathname === apiPath('/notes')) {
    if (request.method === 'GET') {
      return listNotes(env.DB, userId);
    }
    if (request.method === 'POST') {
      return createNote(request, env.DB, userId);
    }
  }

  const noteMatch = url.pathname.match(new RegExp(`^${API_PREFIX}/notes/([^/]+)$`));
  if (noteMatch) {
    const id = noteMatch[1];
    if (request.method === 'PUT') {
      return updateNote(request, env.DB, userId, id);
    }
    if (request.method === 'DELETE') {
      return deleteNote(env.DB, userId, id);
    }
  }

  if (url.pathname === apiPath('/reminders')) {
    if (request.method === 'GET') {
      return listReminders(env.DB, userId);
    }
    if (request.method === 'POST') {
      return createReminder(request, env.DB, userId);
    }
  }

  const reminderMatch = url.pathname.match(new RegExp(`^${API_PREFIX}/reminders/([^/]+)$`));
  if (reminderMatch) {
    const id = reminderMatch[1];
    if (request.method === 'PUT') {
      return updateReminder(request, env.DB, userId, id);
    }
    if (request.method === 'DELETE') {
      return deleteReminder(env.DB, userId, id);
    }
  }

  if (url.pathname === apiPath('/calendar/url') && request.method === 'GET') {
    return getCalendarUrls(request, env, userId);
  }

  if (url.pathname === apiPath('/calendar/regenerate') && request.method === 'POST') {
    return regenerateCalendarToken(env, userId);
  }

  if (url.pathname === apiPath('/capture/token') && request.method === 'GET') {
    return getCaptureToken(env, userId);
  }

  if (url.pathname === apiPath('/capture/regenerate') && request.method === 'POST') {
    return regenerateCaptureToken(env, userId);
  }

  if (url.pathname === apiPath('/assistant') && request.method === 'POST') {
    return handleAssistantChat(request, env, userId);
  }

  return error('Not found', 404, request, env);
}

export function handleOptions(): Response {
  return new Response(null, { headers: corsHeaders });
}

export function isApiPath(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);
}
