import type { Env } from './env';
import { error, logError, makeCorsHeaders } from './env';
import { sendDueNotifications } from './notifications';
import { sendDueReminders } from './reminder-notifications';
import { sendEmailDigests } from './email-digest';
import { isApiPath, handleApi, handleOptions } from './routes';
import { API_PREFIX } from './constants';

// Same-origin SPA — no external scripts/fonts/styles, API is same-origin
// (`/billzzz-api/*`), so this stays strict without needing extra allowances.
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; " +
    "manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function maintenanceEnabled(env: Env): boolean {
  return /^(1|true|on)$/i.test(env.MAINTENANCE_MODE ?? '');
}

function maintenanceResponse(api: boolean, request: Request, env: Env): Response {
  const headers = { 'Retry-After': '300', 'Cache-Control': 'no-store' };
  if (api) {
    return Response.json(
      { error: 'Migración de base de datos en curso. Intenta de nuevo en unos minutos.' },
      { status: 503, headers: { ...headers, ...makeCorsHeaders(env, request) } }
    );
  }
  return new Response(
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Billzzz en mantenimiento</title><body><main><h1>Billzzz está en mantenimiento</h1><p>Estamos migrando la base de datos. Intenta de nuevo en unos minutos.</p></main></body></html>',
    { status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return withSecurityHeaders(handleOptions());
    }

    if (maintenanceEnabled(env) && url.pathname !== `${API_PREFIX}/health`) {
      return withSecurityHeaders(maintenanceResponse(isApiPath(url.pathname), request, env));
    }

    if (isApiPath(url.pathname)) {
      try {
        return withSecurityHeaders(await handleApi(request, env, url));
      } catch (err) {
        logError('api handler failed', err, { path: url.pathname, method: request.method });
        return withSecurityHeaders(error('Error interno', 500, request, env));
      }
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    if (maintenanceEnabled(env)) {
      console.log(JSON.stringify({ message: 'cron skipped during database maintenance' }));
      return;
    }
    // Each task runs independently so a failure in one doesn't block the others.
    let pushResult = { sent: 0, skipped: 0 };
    let reminderResult = { sent: 0, skipped: 0 };
    let emailResult = { sent: 0 };

    try {
      pushResult = await sendDueNotifications(env);
    } catch (err) {
      logError('cron push failed', err);
    }

    try {
      reminderResult = await sendDueReminders(env);
    } catch (err) {
      logError('cron reminders failed', err);
    }

    try {
      emailResult = await sendEmailDigests(env);
    } catch (err) {
      logError('cron email failed', err);
    }

    // Purge expired auth rows to keep table sizes bounded.
    try {
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM sessions WHERE unixepoch(expires_at) < unixepoch()`),
        env.DB.prepare(
          `DELETE FROM magic_links WHERE unixepoch(expires_at) < unixepoch('now', '-1 day')`
        ),
        env.DB.prepare(`DELETE FROM webauthn_challenges WHERE unixepoch(expires_at) < unixepoch()`),
        env.DB.prepare(
          `DELETE FROM auth_rate_limits WHERE unixepoch(window_start) < unixepoch('now', '-1 hour')`
        ),
        env.DB.prepare(
          `DELETE FROM subscriptions
           WHERE trashed_at IS NOT NULL AND unixepoch(trashed_at) < unixepoch('now', '-30 days')`
        ),
        env.DB.prepare(
          `DELETE FROM notes
           WHERE trashed_at IS NOT NULL AND unixepoch(trashed_at) < unixepoch('now', '-30 days')`
        ),
        env.DB.prepare(
          `DELETE FROM reminders
           WHERE trashed_at IS NOT NULL AND unixepoch(trashed_at) < unixepoch('now', '-30 days')`
        ),
        env.DB.prepare(
          `DELETE FROM notification_attempts
           WHERE unixepoch(created_at) < unixepoch('now', '-30 days')`
        ),
        env.DB.prepare(
          `DELETE FROM subscription_notification_claims
           WHERE unixepoch(sent_at) < unixepoch('now', '-90 days')`
        ),
        env.DB.prepare(
          `DELETE FROM email_digest_claims
           WHERE unixepoch(sent_at) < unixepoch('now', '-90 days')`
        ),
        env.DB.prepare(
          `DELETE FROM notification_actions
           WHERE unixepoch(created_at) < unixepoch('now', '-30 days')`
        ),
      ]);
    } catch (err) {
      logError('cron cleanup failed', err);
    }

    console.log(
      JSON.stringify({
        message: 'cron completed',
        pushSent: pushResult.sent,
        pushSkipped: pushResult.skipped,
        reminderPushSent: reminderResult.sent,
        reminderPushSkipped: reminderResult.skipped,
        emailDigestsSent: emailResult.sent,
      })
    );
  },
};
