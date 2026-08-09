import type { Env } from './env';
import { error, logError } from './env';
import { sendDueNotifications } from './notifications';
import { sendDueReminders } from './reminder-notifications';
import { sendEmailDigests } from './email-digest';
import { isApiPath, handleApi, handleOptions } from './routes';

// Same-origin SPA — no external scripts/fonts/styles, API is same-origin
// (`/bills-api/*`), so this stays strict without needing extra allowances.
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return withSecurityHeaders(handleOptions());
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
        env.DB.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`),
        env.DB.prepare(`DELETE FROM magic_links WHERE expires_at < datetime('now', '-1 day')`),
        env.DB.prepare(`DELETE FROM webauthn_challenges WHERE expires_at < datetime('now')`),
        env.DB.prepare(
          `DELETE FROM auth_rate_limits WHERE window_start < datetime('now', '-1 hour')`
        ),
        env.DB.prepare(
          `DELETE FROM subscriptions WHERE trashed_at IS NOT NULL AND trashed_at < datetime('now', '-30 days')`
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
