/** Fase 6a — token de acción firmado para mark-paid/snooze/undo desde el
 * Service Worker, que no tiene acceso al Bearer token de sesión (vive en
 * `localStorage`, inalcanzable desde un SW). No es una sesión: autoriza solo
 * la suscripción y las acciones embebidas, con vencimiento propio.
 */

import { error, isUniqueConstraintError, json } from './env';

export type ActionName = 'pay' | 'snooze' | 'undo';

const ACTION_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const ALL_ACTIONS: ActionName[] = ['pay', 'snooze', 'undo'];

interface ActionTokenPayload {
  sub: string; // subscriptionId
  key: string; // notificationKey
  actions: ActionName[];
  exp: number; // epoch ms
  ver: number; // users.action_token_version al momento de emitir
}

export interface VerifiedActionToken {
  userId: string;
  subscriptionId: string;
  notificationKey: string;
  actions: ActionName[];
}

/** `subId:nextDue:daysLeft` — mismo formato que ya arma sendDueNotifications. */
export function parseNotificationKey(key: string): {
  subscriptionId: string;
  nextDue: string;
  daysLeft: number;
} {
  const [subscriptionId, nextDue, daysLeftStr] = key.split(':');
  return {
    subscriptionId: subscriptionId ?? '',
    nextDue: nextDue ?? '',
    daysLeft: Number(daysLeftStr),
  };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padLen = (4 - (str.length % 4)) % 4;
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Determinístico salvo por `ver`: el mismo notificationKey siempre produce
 * el mismo token mientras no cambie action_token_version — `exp` se deriva
 * del propio notificationKey (nextDue + 14 días), no de Date.now(). */
export async function mintActionToken(
  params: { subscriptionId: string; notificationKey: string; actionTokenVersion: number },
  secret: string
): Promise<string> {
  const { nextDue } = parseNotificationKey(params.notificationKey);
  const payload: ActionTokenPayload = {
    sub: params.subscriptionId,
    key: params.notificationKey,
    actions: ALL_ACTIONS,
    exp: new Date(nextDue).getTime() + ACTION_TOKEN_TTL_MS,
    ver: params.actionTokenVersion,
  };
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    new TextEncoder().encode(payloadB64)
  );
  return `${payloadB64}.${base64UrlEncode(new Uint8Array(sig))}`;
}

/** Verifica firma + vencimiento + que `ver` coincida con el valor actual del
 * usuario en DB (así "cerrar sesión en otros dispositivos" invalida estos
 * tokens también). Nunca loguear el `token` completo en ningún error path. */
export async function verifyActionToken(
  token: string,
  db: D1Database,
  secret: string
): Promise<VerifiedActionToken | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts as [string, string];

  let payload: ActionTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    return null;
  }
  if (typeof payload.sub !== 'string' || typeof payload.key !== 'string') return null;
  if (typeof payload.exp !== 'number' || !Array.isArray(payload.actions)) return null;

  let validSig: boolean;
  try {
    validSig = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      base64UrlDecode(sigB64),
      new TextEncoder().encode(payloadB64)
    );
  } catch {
    return null;
  }
  if (!validSig) return null;
  if (payload.exp < Date.now()) return null;

  const row = await db
    .prepare(
      `SELECT s.user_id AS user_id, u.action_token_version AS action_token_version
       FROM subscriptions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .bind(payload.sub)
    .first<{ user_id: string; action_token_version: number }>();
  if (!row) return null;
  if (row.action_token_version !== payload.ver) return null;

  return {
    userId: row.user_id,
    subscriptionId: payload.sub,
    notificationKey: payload.key,
    actions: payload.actions,
  };
}

export type ActionAuthResult =
  { ok: true; userId: string; notificationKey: string } | { ok: false; status: 401 | 403 };

/** Resuelve auth para mark-paid/snooze/undo cuando llega X-Action-Token en
 * vez de sesión normal. 401 = token inválido/vencido/versión vieja (no es
 * el usuario). 403 = token válido de este usuario pero para OTRA
 * suscripción o para una acción que no tiene autorizada — nunca acceso
 * genérico aunque el token pertenezca a la cuenta correcta. */
export async function resolveActionAuth(
  token: string,
  db: D1Database,
  secret: string,
  urlSubscriptionId: string,
  requiredAction: ActionName
): Promise<ActionAuthResult> {
  const verified = await verifyActionToken(token, db, secret);
  if (!verified) return { ok: false, status: 401 };
  if (verified.subscriptionId !== urlSubscriptionId) return { ok: false, status: 403 };
  if (!verified.actions.includes(requiredAction)) return { ok: false, status: 403 };
  return { ok: true, userId: verified.userId, notificationKey: verified.notificationKey };
}

export interface NotificationActionRow {
  id: string;
  user_id: string;
  subscription_id: string;
  action: 'pay' | 'snooze';
  result_payment_id: string | null;
  prev_snapshot: string;
  post_action_updated_at: string;
  undone_at: string | null;
  created_at: string;
}

/** Claim-first, mismo patrón que `notification_log` (ver notifications.ts):
 * intenta el INSERT antes de mutar nada — si el PRIMARY KEY (=
 * notificationKey) ya existe, algún request idéntico ganó la carrera; el
 * caller debe leer esa fila y devolver su resultado en vez de reprocesar. */
export async function claimNotificationAction(
  db: D1Database,
  params: {
    notificationKey: string;
    userId: string;
    subscriptionId: string;
    action: 'pay' | 'snooze';
    resultPaymentId: string | null;
    prevSnapshot: string;
    postActionUpdatedAt: string;
  }
): Promise<boolean> {
  try {
    await db
      .prepare(
        `INSERT INTO notification_actions
           (id, user_id, subscription_id, action, result_payment_id, prev_snapshot, post_action_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        params.notificationKey,
        params.userId,
        params.subscriptionId,
        params.action,
        params.resultPaymentId,
        params.prevSnapshot,
        params.postActionUpdatedAt
      )
      .run();
    return true;
  } catch (err) {
    if (isUniqueConstraintError(err)) return false;
    throw err;
  }
}

export async function getNotificationAction(
  db: D1Database,
  notificationKey: string
): Promise<NotificationActionRow | null> {
  const row = await db
    .prepare(`SELECT * FROM notification_actions WHERE id = ?`)
    .bind(notificationKey)
    .first<NotificationActionRow>();
  return row ?? null;
}

/** Si el claim ganó pero la mutación que debía acompañarlo falló, libera la
 * fila para que un reintento no quede huérfano contra un claim sin efecto. */
export async function releaseNotificationAction(
  db: D1Database,
  notificationKey: string
): Promise<void> {
  await db.prepare(`DELETE FROM notification_actions WHERE id = ?`).bind(notificationKey).run();
}

export type UndoState = 'ok' | 'already-undone' | 'conflict' | 'not-found';

/** Pura — sin esto el undo aplicaría a ciegas. `post_action_updated_at` es el
 * `updated_at` que la propia acción dejó en la suscripción; si el actual ya
 * no coincide, algo más tocó la suscripción después (otra edición, otro
 * dispositivo) y no es seguro revertir automáticamente. */
export function checkUndoState(
  row: NotificationActionRow | null,
  currentUpdatedAt: string | null | undefined
): UndoState {
  if (!row) return 'not-found';
  if (row.undone_at) return 'already-undone';
  if (currentUpdatedAt !== row.post_action_updated_at) return 'conflict';
  return 'ok';
}

interface PrevSnapshot {
  due_date: string | null;
  due_day: number;
  due_dates: string | null;
  last_paid_at: string | null;
  snoozed_until: string | null;
}

export async function undoNotificationAction(
  db: D1Database,
  userId: string,
  subscriptionId: string,
  notificationKey: string
): Promise<Response> {
  const row = await getNotificationAction(db, notificationKey);
  if (row && (row.user_id !== userId || row.subscription_id !== subscriptionId)) {
    // No revelar que la fila existe si es de otro usuario/suscripción.
    return error('Acción no encontrada', 404);
  }

  const currentSub = await db
    .prepare(`SELECT updated_at FROM subscriptions WHERE id = ? AND user_id = ?`)
    .bind(subscriptionId, userId)
    .first<{ updated_at: string }>();

  const state = checkUndoState(row, currentSub?.updated_at);

  if (state === 'not-found') return error('Acción no encontrada', 404);
  if (state === 'already-undone') return json({ ok: true, alreadyUndone: true });
  if (state === 'conflict') {
    return error(
      'El pago cambió después de esta acción — no se puede deshacer automáticamente',
      409
    );
  }

  const claimed = row as NotificationActionRow;
  const now = new Date().toISOString();

  if (claimed.action === 'snooze') {
    const snapshot = JSON.parse(claimed.prev_snapshot) as { snoozed_until: string | null };
    await db.batch([
      db
        .prepare(
          `UPDATE subscriptions SET snoozed_until = ?, updated_at = ? WHERE id = ? AND user_id = ?`
        )
        .bind(snapshot.snoozed_until, now, subscriptionId, userId),
      db
        .prepare(`UPDATE notification_actions SET undone_at = ? WHERE id = ?`)
        .bind(now, notificationKey),
    ]);
    return json({ ok: true });
  }

  // action === 'pay': restaura las fechas al estado inmediato anterior y
  // borra el payment_record que esa acción creó — nunca a un estado
  // arbitrario, solo al que había un instante antes de esta acción puntual.
  const snapshot = JSON.parse(claimed.prev_snapshot) as PrevSnapshot;
  const statements = [
    db
      .prepare(
        `UPDATE subscriptions SET
           due_date = ?, due_day = ?, due_dates = ?, last_paid_at = ?, snoozed_until = ?,
           deleted_at = NULL, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .bind(
        snapshot.due_date,
        snapshot.due_day,
        snapshot.due_dates,
        snapshot.last_paid_at,
        snapshot.snoozed_until,
        now,
        subscriptionId,
        userId
      ),
    db
      .prepare(`UPDATE notification_actions SET undone_at = ? WHERE id = ?`)
      .bind(now, notificationKey),
  ];
  if (claimed.result_payment_id) {
    statements.push(
      db
        .prepare(`DELETE FROM payment_records WHERE id = ? AND user_id = ?`)
        .bind(claimed.result_payment_id, userId)
    );
  }
  await db.batch(statements);
  return json({ ok: true });
}
