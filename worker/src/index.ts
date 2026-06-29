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
    const push = await sendDueNotifications(env);
    const email = await sendEmailDigests(env);
    console.log(`Cron: push sent=${push.sent} skipped=${push.skipped} email digests=${email.sent}`);
  },
};
