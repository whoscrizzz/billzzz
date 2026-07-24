const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function checkRateLimit(
  db: D1Database,
  key: string,
  maxAttempts: number = MAX_ATTEMPTS
): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // Single UPSERT so the read-check-write is one atomic statement — concurrent
  // requests for the same key can no longer all read "under the cap" before
  // any of their writes land (the previous SELECT-then-UPDATE could).
  const row = await db
    .prepare(
      `INSERT INTO auth_rate_limits (key, attempts, window_start)
       VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         attempts = CASE
           WHEN (unixepoch(?2) - unixepoch(window_start)) * 1000 > ?3 THEN 1
           ELSE attempts + 1
         END,
         window_start = CASE
           WHEN (unixepoch(?2) - unixepoch(window_start)) * 1000 > ?3 THEN ?2
           ELSE window_start
         END
       RETURNING attempts, window_start`
    )
    .bind(key, nowIso, WINDOW_MS)
    .first<{ attempts: number; window_start: string }>();

  if (!row || row.attempts <= maxAttempts) {
    return { allowed: true };
  }

  const windowStart = new Date(row.window_start).getTime();
  const retryAfterSec = Math.max(0, Math.ceil((WINDOW_MS - (now - windowStart)) / 1000));
  return { allowed: false, retryAfterSec };
}

export async function resetRateLimit(db: D1Database, key: string): Promise<void> {
  await db.prepare(`DELETE FROM auth_rate_limits WHERE key = ?`).bind(key).run();
}

export function rateLimitKey(email: string, ip: string | null): string {
  return `verify:${email}:${ip ?? 'unknown'}`;
}
