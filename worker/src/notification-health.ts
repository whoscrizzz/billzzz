import type { Env } from './env';
import { json } from './env';

interface AttemptRow {
  status: 'sent' | 'failed' | 'expired';
  created_at: string;
}

export interface NotificationHealth {
  last_attempt_at: string | null;
  last_status: 'sent' | 'failed' | 'expired' | null;
  consecutive_failures: number;
}

const RECENT_LIMIT = 5;

/** Consecutive non-'sent' attempts counting back from the most recent one. */
export function resolveNotificationHealth(attempts: AttemptRow[]): NotificationHealth {
  if (attempts.length === 0) {
    return { last_attempt_at: null, last_status: null, consecutive_failures: 0 };
  }

  let consecutiveFailures = 0;
  for (const attempt of attempts) {
    if (attempt.status === 'sent') break;
    consecutiveFailures++;
  }

  return {
    last_attempt_at: attempts[0].created_at,
    last_status: attempts[0].status,
    consecutive_failures: consecutiveFailures,
  };
}

export async function getNotificationHealth(env: Env, userId: string): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT status, created_at FROM notification_attempts
     WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  )
    .bind(userId, RECENT_LIMIT)
    .all<AttemptRow>();

  return json(resolveNotificationHealth(results ?? []));
}
