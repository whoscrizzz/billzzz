const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function checkRateLimit(
  db: D1Database,
  key: string,
  maxAttempts: number = MAX_ATTEMPTS
): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }> {
  const now = Date.now();
  const row = await db
    .prepare(`SELECT attempts, window_start FROM auth_rate_limits WHERE key = ?`)
    .bind(key)
    .first<{ attempts: number; window_start: string }>();

  if (!row) {
    await db
      .prepare(
        `INSERT INTO auth_rate_limits (key, attempts, window_start) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET attempts = 1, window_start = excluded.window_start`
      )
      .bind(key, new Date(now).toISOString())
      .run();
    return { allowed: true };
  }

  const windowStart = new Date(row.window_start).getTime();
  if (now - windowStart > WINDOW_MS) {
    await db
      .prepare(`UPDATE auth_rate_limits SET attempts = 1, window_start = ? WHERE key = ?`)
      .bind(new Date(now).toISOString(), key)
      .run();
    return { allowed: true };
  }

  if (row.attempts >= maxAttempts) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - windowStart)) / 1000);
    return { allowed: false, retryAfterSec };
  }

  await db
    .prepare(`UPDATE auth_rate_limits SET attempts = attempts + 1 WHERE key = ?`)
    .bind(key)
    .run();
  return { allowed: true };
}

export async function resetRateLimit(db: D1Database, key: string): Promise<void> {
  await db.prepare(`DELETE FROM auth_rate_limits WHERE key = ?`).bind(key).run();
}

export function rateLimitKey(email: string, ip: string | null): string {
  return `verify:${email}:${ip ?? 'unknown'}`;
}
