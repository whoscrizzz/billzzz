import type { Env } from './env';
import { sendDueNotifications } from './notifications';
import { sendEmailDigests } from './email-digest';
import { isApiPath, handleApi, handleOptions } from './routes';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    if (isApiPath(url.pathname)) {
      return handleApi(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    // Each task runs independently so a failure in one doesn't block the others.
    let pushResult = { sent: 0, skipped: 0 };
    let emailResult = { sent: 0 };

    try {
      pushResult = await sendDueNotifications(env);
    } catch (err) {
      console.error('Cron push error:', err);
    }

    try {
      emailResult = await sendEmailDigests(env);
    } catch (err) {
      console.error('Cron email error:', err);
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
      ]);
    } catch (err) {
      console.error('Cron cleanup error:', err);
    }

    console.log(
      `Cron: push sent=${pushResult.sent} skipped=${pushResult.skipped} email digests=${emailResult.sent}`
    );
  },
};
