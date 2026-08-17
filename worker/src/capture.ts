/** Fase 7b — captura rápida de un gasto sin abrir la app (Atajos/Siri).
 *
 * Autenticación por token opaco de dispositivo (`users.capture_token`), no por
 * sesión: el Atajo no puede pasar por el login. Mismo molde que el
 * `calendar_token` de calendar.ts — token por usuario, regenerable, y una ruta
 * pública que lo resuelve a un userId.
 *
 * El Worker NO parsea texto libre: recibe campos ya estructurados. Parsear
 * acá obligaría a duplicar src/lib/import-reminders.ts en worker/src/ (los
 * bundles no comparten imports, ver CLAUDE.md), y el Atajo puede preguntar
 * monto y categoría por separado sin costo de UX.
 */

import type { Env } from './env';
import { error, json } from './env';
import { checkRateLimit } from './rate-limit';

const MAX_NAME_LEN = 120;
const MAX_CATEGORY_LEN = 120;
const MAX_CURRENCY_LEN = 10;

/** Tope propio, más alto que el de auth (5): capturar varios gastos seguidos
 * es uso legítimo, pero sigue acotado porque la ruta no tiene sesión. */
const CAPTURE_MAX_PER_WINDOW = 30;

interface CaptureBody {
  amount?: number;
  name?: string;
  category?: string;
  currency?: string;
  paid_at?: string;
  notes?: string;
  subscription_id?: string;
}

export async function getCaptureToken(env: Env, userId: string): Promise<Response> {
  const token = await ensureCaptureToken(env.DB, userId);
  return json({ token });
}

export async function regenerateCaptureToken(env: Env, userId: string): Promise<Response> {
  const token = crypto.randomUUID();
  await env.DB.prepare(`UPDATE users SET capture_token = ? WHERE id = ?`).bind(token, userId).run();
  return json({ ok: true, token });
}

async function ensureCaptureToken(db: D1Database, userId: string): Promise<string> {
  const row = await db
    .prepare(`SELECT capture_token FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ capture_token: string | null }>();

  if (row?.capture_token) return row.capture_token;

  const token = crypto.randomUUID();
  await db.prepare(`UPDATE users SET capture_token = ? WHERE id = ?`).bind(token, userId).run();
  return token;
}

export async function captureExpense(request: Request, env: Env, token: string): Promise<Response> {
  // Rate limit por token ANTES de tocar la DB de usuarios — es una ruta sin
  // sesión, así que un token filtrado o adivinado no debe poder escribir sin
  // tope. checkRateLimit es un solo UPSERT atómico (ver rate-limit.ts).
  const rl = await checkRateLimit(env.DB, `capture:${token}`, CAPTURE_MAX_PER_WINDOW);
  if (!rl.allowed) {
    return json({ error: 'Demasiadas capturas seguidas', retryAfterSec: rl.retryAfterSec }, 429);
  }

  // `AND disabled = 0` por el mismo motivo que en calendar.ts: es una ruta sin sesión, así
  // que un Atajo ya guardado seguiría escribiendo pagos indefinidamente tras revocar.
  const user = await env.DB.prepare(
    `SELECT id, fx_usd_mxn FROM users WHERE capture_token = ? AND disabled = 0`
  )
    .bind(token)
    .first<{ id: string; fx_usd_mxn: number | null }>();
  if (!user) return error('No autorizado', 401);

  const body = (await request.json().catch(() => ({}))) as CaptureBody;

  if (body.amount == null || !Number.isFinite(body.amount) || body.amount < 0) {
    return error('El monto debe ser un número válido y no negativo');
  }
  if (body.name != null && body.name.length > MAX_NAME_LEN) {
    return error(`El nombre debe tener ${MAX_NAME_LEN} caracteres o menos`);
  }
  if (body.category != null && body.category.length > MAX_CATEGORY_LEN) {
    return error(`La categoría debe tener ${MAX_CATEGORY_LEN} caracteres o menos`);
  }
  if (
    body.currency != null &&
    (body.currency.length === 0 || body.currency.length > MAX_CURRENCY_LEN)
  ) {
    return error(`La moneda debe tener entre 1 y ${MAX_CURRENCY_LEN} caracteres`);
  }

  let paidAt = new Date().toISOString();
  if (body.paid_at) {
    const parsed = new Date(body.paid_at);
    if (Number.isNaN(parsed.getTime())) return error('paid_at inválido');
    paidAt = parsed.toISOString();
  }

  // Con subscription_id el gasto se ata a un bill existente del MISMO usuario
  // (se valida la pertenencia, no basta con que el id exista); sin él es un
  // gasto suelto y name/category viven en la propia fila.
  let subscriptionId: string | null = null;
  if (body.subscription_id) {
    const sub = await env.DB.prepare(
      `SELECT id FROM subscriptions
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND trashed_at IS NULL`
    )
      .bind(body.subscription_id, user.id)
      .first<{ id: string }>();
    if (!sub) return error('Suscripción no encontrada', 404);
    subscriptionId = sub.id;
  }

  const name = body.name?.trim() || null;
  const category = body.category?.trim() || null;
  const currency = body.currency?.trim() || 'MXN';
  const recordId = crypto.randomUUID();

  // Mismo congelado que markSubscriptionPaid (ver migración 0021): la
  // captura no tiene UI para pisar la tasa, así que siempre toma el
  // fx_usd_mxn actual del usuario en USD, o NULL si no hay tasa configurada.
  const fxUsdMxn = currency === 'USD' ? user.fx_usd_mxn : null;

  await env.DB.prepare(
    `INSERT INTO payment_records
       (id, user_id, subscription_id, amount, currency, paid_at, notes, name, category, fx_usd_mxn)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      recordId,
      user.id,
      subscriptionId,
      body.amount,
      currency,
      paidAt,
      body.notes?.trim() || null,
      // Un pago atado a una suscripción toma nombre/categoría de ella vía
      // JOIN, igual que siempre — no se duplican acá.
      subscriptionId ? null : name,
      subscriptionId ? null : category,
      fxUsdMxn
    )
    .run();

  return json({ ok: true, paymentId: recordId, paid_at: paidAt });
}
