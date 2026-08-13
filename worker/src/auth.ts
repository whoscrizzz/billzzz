import { defaultDeviceName } from './device-name';
import type { Env } from './env';
import { appOrigin, error, isValidEmail, json, logError, normalizeEmail } from './env';
import { checkRateLimit, rateLimitKey, resetRateLimit } from './rate-limit';

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
/**
 * Returned both when a link was actually sent and when the address has no account, so
 * the endpoint can't be used to enumerate who is registered.
 */
const MAGIC_LINK_SENT_MESSAGE = 'Revisa tu correo (y spam). El enlace expira en 15 minutos.';
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

  // Joins `users` so a revoked account loses access on its next request instead of riding
  // out its session (up to 90 days). This is what makes `npm run revoke` take effect now.
  const row = await env.DB.prepare(
    `SELECT s.user_id, s.expires_at, u.disabled
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  )
    .bind(token)
    .first<{ user_id: string; expires_at: string; disabled: number }>();

  if (!row) return null;
  if (row.disabled) return null;
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

  // Invite-only: an account is provisioned out of band (see `npm run invite:*`), never by
  // logging in. Unknown addresses get the same shape of response as known ones — no link
  // is issued and no row is written.
  const userId = await findUserIdByEmail(env.DB, email);
  if (!userId) {
    return json({ ok: true, message: MAGIC_LINK_SENT_MESSAGE });
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
      return json({ ok: true, message: MAGIC_LINK_SENT_MESSAGE });
    }
    // Email failed: never expose the token or shortCode in the response.
    // The user must request a new link or wait for retry.
    return json({
      ok: true,
      message:
        'No se pudo enviar el correo. Verifica la dirección o intenta de nuevo en unos minutos.',
    });
  }

  // No email provider configured. This response deliberately carries no token: the API must
  // never hand a caller the credential it just minted, in any environment. Local dev reads
  // the pending link straight out of D1 instead (`npm run dev:link -- <email>`), which is a
  // capability the developer already has and the Worker doesn't need to expose.
  logError('magic link requested but no email provider is configured', 'RESEND_API_KEY/EMAIL_FROM');
  return error('El servicio de correo no está disponible. Inténtalo más tarde.', 503, request, env);
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
  return createSessionFromMagicLink(request, env, link!);
}

export async function verifyMagicLinkCode(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { email?: string; code?: string };
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
  return createSessionFromMagicLink(request, env, link!);
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

async function createSessionFromMagicLink(
  request: Request,
  env: Env,
  link: MagicLinkRow
): Promise<Response> {
  // Requesting the link already gated on an existing account, but a link outlives the row
  // it was issued against (15 min TTL) — if the account was removed in between, verifying
  // must fail rather than recreate it.
  const userId = await findUserIdByEmail(env.DB, link.email);
  if (!userId) return error('Esta cuenta ya no está activa', 403);

  await env.DB.prepare(`UPDATE magic_links SET used_at = datetime('now') WHERE token = ?`)
    .bind(link.token)
    .run();

  return createUserSession(request, env, userId, link.email);
}

export async function createUserSession(
  request: Request,
  env: Env,
  userId: string,
  email: string
): Promise<Response> {
  const sessionToken = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const sessionExpires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const userAgent = request.headers.get('User-Agent');
  const ip = request.headers.get('CF-Connecting-IP');
  const deviceName = defaultDeviceName(userAgent);

  await env.DB.prepare(
    `INSERT INTO sessions (token, id, user_id, expires_at, user_agent, ip, device_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(sessionToken, sessionId, userId, sessionExpires, userAgent, ip, deviceName)
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

/** Deletes every session for this user except the one making the request, and
 * bumps action_token_version so any outstanding notification action tokens
 * (mark-paid/snooze/undo from the Service Worker) are invalidated too.
 * Returns sessions removed. */
export async function revokeOtherSessions(
  env: Env,
  userId: string,
  currentToken: string
): Promise<number> {
  const [sessionsResult] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND token != ?`).bind(
      userId,
      currentToken
    ),
    env.DB.prepare(
      `UPDATE users SET action_token_version = action_token_version + 1 WHERE id = ?`
    ).bind(userId),
  ]);
  return sessionsResult.meta.changes ?? 0;
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

interface SessionRow {
  id: string;
  device_name: string | null;
  ip: string | null;
  created_at: string;
  expires_at: string;
  token: string;
}

/** Lists active sessions for a user. Never includes raw tokens for OTHER sessions. */
export async function listSessionsHandler(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const currentToken = getBearerToken(request);
  const { results } = await env.DB.prepare(
    `SELECT id, device_name, ip, created_at, expires_at, token FROM sessions
     WHERE user_id = ? AND expires_at > datetime('now')
     ORDER BY created_at DESC`
  )
    .bind(userId)
    .all<SessionRow>();

  return json({
    sessions: (results ?? []).map((row) => ({
      id: row.id,
      device_name: row.device_name ?? 'Dispositivo',
      ip: row.ip,
      created_at: row.created_at,
      expires_at: row.expires_at,
      is_current: row.token === currentToken,
    })),
  });
}

export async function revokeSessionByIdHandler(
  env: Env,
  userId: string,
  sessionId: string
): Promise<Response> {
  const result = await env.DB.prepare(`DELETE FROM sessions WHERE id = ? AND user_id = ?`)
    .bind(sessionId, userId)
    .run();

  if (result.meta.changes === 0) {
    return error('Sesión no encontrada', 404);
  }

  return json({ ok: true });
}

/** A disabled account is treated as non-existent here: it can't request or redeem a link. */
async function findUserIdByEmail(db: D1Database, email: string): Promise<string | null> {
  const existing = await db
    .prepare(`SELECT id FROM users WHERE email = ? AND disabled = 0`)
    .bind(email)
    .first<{ id: string }>();

  return existing?.id ?? null;
}

/**
 * Admin-only: manda el email de bienvenida cuando se invita a alguien nuevo.
 * Protegido por ADMIN_TOKEN (secreto compartido, no sesión de usuario) porque
 * lo llama scripts/invite-user.mjs, no la app. A diferencia del magic link,
 * no lleva token ni código — es solo un aviso con un link a la app; la
 * persona invitada pide su propio código de acceso normal al llegar.
 */
export async function handleAdminSendInvite(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!env.ADMIN_TOKEN || !providedToken || providedToken !== env.ADMIN_TOKEN) {
    return error('No autorizado', 401, request, env);
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email ? normalizeEmail(body.email) : '';
  if (!isValidEmail(email)) return error('Email inválido', 400, request, env);

  // El usuario ya se provisionó en D1 aparte (invite-user.mjs) — este endpoint
  // solo manda el correo. Igual confirmamos que existe y está activo, para no
  // mandar una invitación a una cuenta deshabilitada o inexistente.
  const userId = await findUserIdByEmail(env.DB, email);
  if (!userId) return error('Esa cuenta no existe o está deshabilitada', 404, request, env);

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logError(
      'invite email requested but no email provider is configured',
      'RESEND_API_KEY/EMAIL_FROM'
    );
    return error('El servicio de correo no está disponible', 503, request, env);
  }

  const result = await sendInviteEmail(env, email, appOrigin(env, request));
  if (!result.ok) {
    return error('No se pudo enviar el correo de invitación', 502, request, env);
  }

  return json({ ok: true });
}

async function sendInviteEmail(
  env: Env,
  to: string,
  appUrl: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        reply_to: 'billzzz@whoscrizzz.com',
        to: [to],
        subject: 'Te invitaron a Billzzz',
        headers: {
          'List-Unsubscribe': '<mailto:billzzz@whoscrizzz.com?subject=unsubscribe>',
        },
        text: `Billzzz — te invitaron\n\nYa tenés una cuenta lista en Billzzz, la app para llevar el control de tus pagos y suscripciones.\n\nAbrí ${appUrl} y escribí este correo (${to}) en la pantalla de inicio de sesión — te va a llegar un código de acceso al toque, nada que recordar de antemano.\n\nSi no esperabas este correo, ignoralo.\n— Billzzz · billzzz.whoscrizzz.com`,
        html: `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;background:#0a0a0f;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#34d399">Billzzz · billzzz.whoscrizzz.com</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#f8fafc">Te invitaron a Billzzz</h1>
    <p style="margin:0 0 12px;line-height:1.6;color:#94a3b8">Ya tenés una cuenta lista para llevar el control de tus pagos y suscripciones.</p>
    <p style="margin:0 0 24px;line-height:1.6;color:#94a3b8">Abrí la app y escribí <strong style="color:#e2e8f0">${to}</strong> en la pantalla de inicio de sesión — te llega un código de acceso al toque, no hace falta contraseña.</p>
    <a href="${appUrl}" style="display:inline-block;background:#34d399;color:#052e16;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:600">Abrir Billzzz</a>
    <hr style="margin:28px 0;border:none;border-top:1px solid #1e293b">
    <p style="margin:0;font-size:12px;color:#475569">Si no esperabas este correo, podés ignorarlo.</p>
  </div>
</body>
</html>`,
      }),
    });
  } catch (err) {
    logError('resend invite fetch failed', err, { to });
    return { ok: false, error: 'network error' };
  }

  if (res.ok) return { ok: true };

  const body = (await res.json().catch(() => ({}))) as { message?: string };
  logError('resend invite send failed', body.message ?? `HTTP ${res.status}`, {
    status: res.status,
  });
  return { ok: false, error: body.message ?? `HTTP ${res.status}` };
}

async function sendMagicLinkEmail(
  env: Env,
  to: string,
  verifyUrl: string,
  shortCode: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        reply_to: 'billzzz@whoscrizzz.com',
        to: [to],
        subject: `Tu código Billzzz: ${shortCode}`,
        headers: {
          'List-Unsubscribe': '<mailto:billzzz@whoscrizzz.com?subject=unsubscribe>',
        },
        text: `Billzzz — acceso seguro\n\nTu código (válido 15 minutos): ${shortCode}\n\nEn la app instalada escribe este código en la pantalla de inicio de sesión.\n\nO abre este enlace y toca «Entrar a Billzzz»:\n${verifyUrl}\n\nSi no pediste este correo, ignóralo.\n— Billzzz · billzzz.whoscrizzz.com`,
        html: `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;background:#0a0a0f;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#34d399">Billzzz · billzzz.whoscrizzz.com</p>
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
  } catch (err) {
    logError('resend fetch failed', err);
    return { ok: false, error: 'network error' };
  }

  if (res.ok) {
    return { ok: true };
  }

  const body = (await res.json().catch(() => ({}))) as { message?: string };
  logError('resend send failed', body.message ?? `HTTP ${res.status}`, { status: res.status });
  return { ok: false, error: body.message ?? `HTTP ${res.status}` };
}
