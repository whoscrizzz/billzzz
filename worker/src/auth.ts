import type { Env } from './env';
import { appOrigin, error, isValidEmail, json, logError, normalizeEmail } from './env';
import { checkRateLimit, rateLimitKey, resetRateLimit } from './rate-limit';

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_THRESHOLD_MS = SESSION_TTL_MS / 2; // only roll when < 45 days remain

export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

export async function getSessionUserId(request: Request, env: Env): Promise<string | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  const row = await env.DB.prepare(`SELECT user_id, expires_at FROM sessions WHERE token = ?`)
    .bind(token)
    .first<{ user_id: string; expires_at: string }>();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  // Only slide the expiry window when less than half the TTL remains (~45 days).
  // This reduces D1 writes by ~95% with no UX impact.
  if (new Date(row.expires_at).getTime() - Date.now() < SESSION_REFRESH_THRESHOLD_MS) {
    const newExpires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await env.DB.prepare(`UPDATE sessions SET expires_at = ? WHERE token = ?`)
      .bind(newExpires, token)
      .run();
  }

  return row.user_id;
}

export async function requestMagicLink(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email ? normalizeEmail(body.email) : '';

  if (!isValidEmail(email)) {
    return error('Email inválido');
  }

  // Rate-limit by IP to prevent inbox-bombing and DB spam
  const ip = request.headers.get('CF-Connecting-IP');
  const rl = await checkRateLimit(env.DB, rateLimitKey(email, ip));
  if (!rl.allowed) {
    return error(`Demasiados intentos. Espera ${rl.retryAfterSec}s`, 429);
  }

  const token = crypto.randomUUID();
  const shortCode = generateShortCode();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString();

  await env.DB.prepare(
    `INSERT INTO magic_links (token, email, expires_at, short_code) VALUES (?, ?, ?, ?)`
  )
    .bind(token, email, expiresAt, shortCode)
    .run();

  const verifyUrl = `${appOrigin(env, request)}/auth/verify?token=${token}`;

  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const result = await sendMagicLinkEmail(env, email, verifyUrl, shortCode);
    if (result.ok) {
      return json({
        ok: true,
        message: 'Revisa tu correo (y spam). El enlace expira en 15 minutos.',
        ...(result.fallback ? { verifyUrl } : {}),
      });
    }
    // Email failed: never expose the token or shortCode in the response.
    // The user must request a new link or wait for retry.
    return json({
      ok: true,
      message:
        'No se pudo enviar el correo. Verifica la dirección o intenta de nuevo en unos minutos.',
    });
  }

  // No email configured (local/dev): surface the link for convenience
  return json({
    ok: true,
    message: 'Toca el botón para entrar a la app',
    verifyUrl,
    shortCode,
  });
}

export async function verifyMagicLink(
  request: Request,
  env: Env,
  token: string
): Promise<Response> {
  if (!token) return error('Token requerido');

  // Rate-limit the token path as well to prevent brute-force UUID guessing
  const ip = request.headers.get('CF-Connecting-IP');
  const rl = await checkRateLimit(env.DB, `verify_token:${ip ?? 'unknown'}`);
  if (!rl.allowed) {
    return error(`Demasiados intentos. Espera ${rl.retryAfterSec}s`, 429);
  }

  const link = await env.DB.prepare(
    `SELECT token, email, expires_at, used_at FROM magic_links WHERE token = ?`
  )
    .bind(token)
    .first<MagicLinkRow>();

  const linkError = validateMagicLinkRow(link);
  if (linkError) return linkError;

  await resetRateLimit(env.DB, `verify_token:${ip ?? 'unknown'}`);
  return createSessionFromMagicLink(env, link!);
}

export async function verifyMagicLinkCode(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { email?: string; code?: string };
  const email = body.email ? normalizeEmail(body.email) : '';
  const code = body.code?.trim().replace(/\s/g, '') ?? '';

  if (!isValidEmail(email)) return error('Email inválido');
  if (!/^\d{6}$/.test(code)) return error('Código inválido — deben ser 6 dígitos');

  const ip = request.headers.get('CF-Connecting-IP');
  const rl = await checkRateLimit(env.DB, rateLimitKey(email, ip));
  if (!rl.allowed) {
    return error(`Demasiados intentos. Espera ${rl.retryAfterSec}s`, 429);
  }

  const link = await env.DB.prepare(
    `SELECT token, email, expires_at, used_at FROM magic_links
     WHERE email = ? AND short_code = ?
     ORDER BY expires_at DESC LIMIT 1`
  )
    .bind(email, code)
    .first<MagicLinkRow>();

  const linkError = validateMagicLinkRow(link);
  if (linkError) return error('Código incorrecto o expirado', 404);

  await resetRateLimit(env.DB, rateLimitKey(email, ip));
  return createSessionFromMagicLink(env, link!);
}

interface MagicLinkRow {
  token: string;
  email: string;
  expires_at: string;
  used_at: string | null;
}

function validateMagicLinkRow(link: MagicLinkRow | null): Response | null {
  if (!link) return error('Enlace inválido', 404);
  if (link.used_at) return error('Enlace ya usado', 410);
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return error('Enlace expirado', 410);
  }
  return null;
}

async function createSessionFromMagicLink(env: Env, link: MagicLinkRow): Promise<Response> {
  const userId = await findOrCreateUserByEmail(env.DB, link.email);

  await env.DB.prepare(`UPDATE magic_links SET used_at = datetime('now') WHERE token = ?`)
    .bind(link.token)
    .run();

  return createUserSession(env, userId, link.email);
}

export async function createUserSession(
  env: Env,
  userId: string,
  email: string
): Promise<Response> {
  const sessionToken = crypto.randomUUID();
  const sessionExpires = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await env.DB.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(sessionToken, userId, sessionExpires)
    .run();

  return json({
    token: sessionToken,
    user: { id: userId, email },
  });
}

function generateShortCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(6, '0');
}

export async function getMe(env: Env, userId: string): Promise<Response> {
  const user = await env.DB.prepare(
    `SELECT id, email, display_name, budget_limit, email_reminders FROM users WHERE id = ?`
  )
    .bind(userId)
    .first<{
      id: string;
      email: string | null;
      display_name: string | null;
      budget_limit: number | null;
      email_reminders: number;
    }>();

  if (!user) return error('Usuario no encontrado', 404);
  return json({
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      budget_limit: user.budget_limit,
      email_reminders: user.email_reminders === 1,
    },
  });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const token = getBearerToken(request);
  if (token) {
    await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
  }
  return json({ ok: true });
}

/** Deletes every session for this user except the one making the request. Returns rows removed. */
export async function revokeOtherSessions(
  env: Env,
  userId: string,
  currentToken: string
): Promise<number> {
  const result = await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND token != ?`)
    .bind(userId, currentToken)
    .run();
  return result.meta.changes ?? 0;
}

export async function revokeOtherSessionsHandler(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return error('Sesión inválida', 401);
  const revoked = await revokeOtherSessions(env, userId, token);
  return json({ ok: true, revoked });
}

async function findOrCreateUserByEmail(db: D1Database, email: string): Promise<string> {
  const existing = await db
    .prepare(`SELECT id FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();

  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO users (id, email) VALUES (?, ?)`).bind(id, email).run();
  return id;
}

async function sendMagicLinkEmail(
  env: Env,
  to: string,
  verifyUrl: string,
  shortCode: string
): Promise<{ ok: true; fallback?: boolean } | { ok: false; error: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      reply_to: 'bills@whoscrizzz.com',
      to: [to],
      subject: `Tu código Bills: ${shortCode}`,
      headers: {
        'List-Unsubscribe': '<mailto:bills@whoscrizzz.com?subject=unsubscribe>',
      },
      text: `Bills — acceso seguro\n\nTu código (válido 15 minutos): ${shortCode}\n\nEn la app instalada escribe este código en la pantalla de inicio de sesión.\n\nO abre este enlace y toca «Entrar a Bills»:\n${verifyUrl}\n\nSi no pediste este correo, ignóralo.\n— Bills · bills.whoscrizzz.com`,
      html: `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;background:#0a0a0f;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#34d399">Bills · bills.whoscrizzz.com</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#f8fafc">Tu código de acceso</h1>
    <p style="margin:0 0 12px;line-height:1.6;color:#94a3b8">En la <strong style="color:#e2e8f0">app instalada</strong>, escribe este código en la pantalla de login (no hace falta pegar el enlace):</p>
    <p style="margin:0 0 24px;font-size:36px;font-weight:700;letter-spacing:0.25em;color:#34d399;font-family:ui-monospace,monospace">${shortCode}</p>
    <p style="margin:0 0 12px;font-size:14px;color:#64748b">También puedes abrir el enlace y confirmar con el botón. Expira en 15 minutos.</p>
    <a href="${verifyUrl}" style="display:inline-block;background:#34d399;color:#052e16;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:600">Abrir enlace de acceso</a>
    <p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#64748b">Enlace alternativo:<br><span style="word-break:break-all;color:#94a3b8">${verifyUrl}</span></p>
    <hr style="margin:28px 0;border:none;border-top:1px solid #1e293b">
    <p style="margin:0;font-size:12px;color:#475569">Si no pediste este correo, puedes ignorarlo.</p>
  </div>
</body>
</html>`,
    }),
  });

  if (res.ok) {
    return { ok: true };
  }

  const body = (await res.json().catch(() => ({}))) as { message?: string };
  logError('resend send failed', body.message ?? `HTTP ${res.status}`, { status: res.status });
  return { ok: false, error: body.message ?? `HTTP ${res.status}` };
}
