import { sendNotification } from 'web-push-neo';
import type { Env, PushSubscriptionRow, SubscriptionRow } from './env';
import { isUniqueConstraintError, logError, pushTopic } from './env';
import { daysUntilNextDue, nextDueIsoDate } from './due-dates';
import { currentDueAmount } from './due-dates-json';
import { getHourInTimeZone, NOTIFY_TIMEZONE } from './timezone';
import { mintActionToken, mintGroupActionToken } from './notification-actions';
import { formatMoney } from './format-money';

export { daysUntilNextDue };

export function formatDueMessage(
  sub: SubscriptionRow,
  daysLeft: number,
  now: Date,
  timezone: string
): string {
  const money = formatMoney(currentDueAmount(sub, now, timezone), sub.currency);
  if (daysLeft < 0) {
    const n = Math.abs(daysLeft);
    return n === 1
      ? `${sub.name} venció ayer (${money})`
      : `${sub.name} vencido hace ${n} días (${money})`;
  }
  if (daysLeft === 0) return `${sub.name} vence hoy (${money})`;
  if (daysLeft === 1) return `${sub.name} vence mañana (${money})`;
  return `${sub.name} vence en ${daysLeft} días (${money})`;
}

/** Cuerpo del push agrupado — mismo criterio de "hace N días / hoy / mañana"
 * que formatDueMessage, pero sobre N suscripciones que comparten daysLeft
 * (mismo tick, mismo nextDue). Si el grupo mezcla monedas no hay un total
 * único que mostrar con sentido — se omite el monto en vez de sumarlas. */
export function formatGroupDueMessage(
  members: SubscriptionRow[],
  daysLeft: number,
  now: Date,
  timezone: string
): string {
  const when =
    daysLeft < 0
      ? Math.abs(daysLeft) === 1
        ? 'vencieron ayer'
        : `vencidos hace ${Math.abs(daysLeft)} días`
      : daysLeft === 0
        ? 'vencen hoy'
        : daysLeft === 1
          ? 'vencen mañana'
          : `vencen en ${daysLeft} días`;

  const currencies = new Set(members.map((m) => m.currency));
  if (currencies.size === 1) {
    const total = members.reduce((sum, s) => sum + currentDueAmount(s, now, timezone), 0);
    const money = formatMoney(total, members[0]!.currency);
    return `${members.length} pagos ${when} · ${money}`;
  }
  return `${members.length} pagos ${when}`;
}

/** Whether a subscription should receive a push this cron tick.
 *  notify_hour is wall-clock hour in the owning user's timezone (defaults to
 *  NOTIFY_TIMEZONE/Mexico City when the caller doesn't pass one).
 */
export function shouldNotifyNow(
  sub: SubscriptionRow,
  now = new Date(),
  timezone: string = NOTIFY_TIMEZONE
): boolean {
  const daysLeft = daysUntilNextDue(sub, now, timezone);
  if (daysLeft == null) return false;
  // Include overdue up to 7 days + upcoming within notify_days_before
  if (daysLeft < -7 || daysLeft > sub.notify_days_before) return false;
  const hour = sub.notify_hour ?? 9;
  const hourNow = getHourInTimeZone(now, timezone);
  return hourNow >= hour && hourNow < hour + 1;
}

async function recordAttempt(
  env: Env,
  sub: SubscriptionRow,
  status: 'sent' | 'failed' | 'expired',
  err?: unknown
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notification_attempts (id, user_id, subscription_id, status, error)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      sub.user_id,
      sub.id,
      status,
      err instanceof Error ? err.message : err != null ? String(err) : null
    )
    .run();
}

type TimedSubscriptionRow = SubscriptionRow & {
  user_timezone: string;
  action_token_version: number;
};

interface ClaimedNotification {
  sub: TimedSubscriptionRow;
  notificationKey: string;
  nextDue: string;
  daysLeft: number;
}

/** Entrega un mismo payload a todos los endpoints push de un usuario y
 * registra un intento por CADA suscripción del grupo en cada endpoint —
 * misma granularidad que /notifications/health tenía antes de agrupar,
 * aunque ahora un solo payload pueda cubrir varias suscripciones. */
async function deliverPushPayload(
  env: Env,
  members: SubscriptionRow[],
  pushSubs: PushSubscriptionRow[],
  payload: string,
  vapid: { subject: string; publicKey: string; privateKey: string },
  urgency: 'high' | 'normal',
  topic: string
): Promise<boolean> {
  let delivered = false;
  const expiredEndpointIds: string[] = [];

  for (const pushSub of pushSubs) {
    try {
      await sendNotification(
        { endpoint: pushSub.endpoint, keys: { p256dh: pushSub.p256dh, auth: pushSub.auth } },
        payload,
        { vapidDetails: vapid, TTL: 86_400, urgency, topic }
      );
      delivered = true;
      for (const sub of members) await recordAttempt(env, sub, 'sent');
    } catch (err) {
      // Per Web Push spec, a 410 Gone means the subscription is permanently expired.
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        expiredEndpointIds.push(pushSub.id);
        for (const sub of members) await recordAttempt(env, sub, 'expired', err);
      } else {
        // Anything else (network error, 429, 5xx, malformed VAPID, …) would
        // otherwise fail silently — log it so a persistent delivery problem
        // is actually visible instead of just "the user got no reminder."
        logError('push send failed', err, {
          subscriptionIds: members.map((s) => s.id),
          userId: members[0]?.user_id,
          status,
        });
        for (const sub of members) await recordAttempt(env, sub, 'failed', err);
      }
    }
  }

  // Prune expired push endpoints so we stop trying to deliver to them
  if (expiredEndpointIds.length > 0) {
    await env.DB.batch(
      expiredEndpointIds.map((id) =>
        env.DB.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).bind(id)
      )
    );
  }

  return delivered;
}

export async function sendDueNotifications(env: Env): Promise<{ sent: number; skipped: number }> {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    return { sent: 0, skipped: 0 };
  }

  const vapid = {
    subject: env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  const { results: subs } = await env.DB.prepare(
    `SELECT s.*, u.timezone AS user_timezone, u.action_token_version AS action_token_version
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE s.deleted_at IS NULL AND s.trashed_at IS NULL AND u.disabled = 0`
  ).all<TimedSubscriptionRow>();

  let sent = 0;
  let skipped = 0;
  const now = new Date();

  // Paso 1 — mismo claim atómico por suscripción de siempre (INSERT en
  // notification_log, UNIQUE constraint como mutex). Agrupar en el paso 2
  // nunca cambia CUÁNDO se manda un aviso, solo cuántos pushes separados
  // hacen falta para mandarlo.
  const claimed: ClaimedNotification[] = [];
  for (const sub of subs ?? []) {
    const daysLeft = daysUntilNextDue(sub, now, sub.user_timezone);
    if (!shouldNotifyNow(sub, now, sub.user_timezone)) {
      skipped++;
      continue;
    }

    const nextDue = nextDueIsoDate(sub, now, sub.user_timezone);
    if (!nextDue || daysLeft == null) {
      skipped++;
      continue;
    }

    const notificationKey = `${sub.id}:${nextDue}:${daysLeft}`;

    try {
      await env.DB.prepare(
        `INSERT INTO notification_log (id, user_id, subscription_id, notification_key)
         VALUES (?, ?, ?, ?)`
      )
        .bind(crypto.randomUUID(), sub.user_id, sub.id, notificationKey)
        .run();
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        skipped++;
        continue;
      }
      throw err;
    }

    claimed.push({ sub, notificationKey, nextDue, daysLeft });
  }

  // Paso 2 — agrupar por usuario+día de vencimiento (mismo tick ⇒ mismo
  // `now` ⇒ mismo daysLeft dentro de un grupo, sin ambigüedad) y mandar un
  // solo push por grupo en vez de uno por suscripción.
  const groups = new Map<string, ClaimedNotification[]>();
  for (const c of claimed) {
    const groupKey = `${c.sub.user_id}:${c.nextDue}`;
    const list = groups.get(groupKey);
    if (list) list.push(c);
    else groups.set(groupKey, [c]);
  }

  for (const group of groups.values()) {
    const first = group[0]!;
    const { results: pushSubs } = await env.DB.prepare(
      `SELECT * FROM push_subscriptions WHERE user_id = ?`
    )
      .bind(first.sub.user_id)
      .all<PushSubscriptionRow>();

    if (!pushSubs?.length) {
      // Sin esto, notification_attempts deja de crecer en cuanto se poda la
      // última suscripción push de un usuario (ver deliverPushPayload más
      // abajo) — last_attempt_at queda congelado y "N días sin avisos" en
      // Ajustes crece para siempre sin que nada lo resuelva.
      for (const c of group) {
        await releaseNotificationClaim(env, c.sub, c.notificationKey);
        await recordAttempt(env, c.sub, 'expired', 'no_push_subscriptions');
      }
      skipped += group.length;
      continue;
    }

    const members = group.map((c) => c.sub);
    const daysLeft = first.daysLeft;
    const urgency: 'high' | 'normal' = daysLeft <= 0 ? 'high' : 'normal';

    let payload: string;
    let topic: string;

    if (group.length === 1) {
      // Camino de siempre — un solo miembro, cero cambio de comportamiento.
      const actionToken = env.ACTION_TOKEN_SECRET
        ? await mintActionToken(
            {
              subscriptionId: first.sub.id,
              notificationKey: first.notificationKey,
              actionTokenVersion: first.sub.action_token_version,
            },
            env.ACTION_TOKEN_SECRET
          )
        : null;
      payload = JSON.stringify({
        title: daysLeft < 0 ? 'Pago vencido' : 'Recordatorio de pago',
        body: formatDueMessage(first.sub, daysLeft, now, first.sub.user_timezone),
        url: '/',
        subscriptionId: first.sub.id,
        notificationKey: first.notificationKey,
        ...(actionToken ? { actionToken } : {}),
      });
      topic = pushTopic(`bill-${first.sub.id}`);
    } else {
      // El token de acción falta si ACTION_TOKEN_SECRET no está configurado —
      // la notificación igual se envía, solo queda sin botón "Marcar todos".
      const actionToken = env.ACTION_TOKEN_SECRET
        ? await mintGroupActionToken(
            group.map((c) => ({ subscriptionId: c.sub.id, notificationKey: c.notificationKey })),
            first.sub.action_token_version,
            env.ACTION_TOKEN_SECRET
          )
        : null;
      const groupNotificationKey = `group:${first.nextDue}:${members
        .map((m) => m.id)
        .sort()
        .join(',')}`;
      payload = JSON.stringify({
        title: daysLeft < 0 ? 'Pagos vencidos' : 'Recordatorio de pagos',
        body: formatGroupDueMessage(members, daysLeft, now, first.sub.user_timezone),
        url: '/',
        group: true,
        notificationKey: groupNotificationKey,
        items: members.map((m) => ({
          subscriptionId: m.id,
          name: m.name,
          amount: currentDueAmount(m, now, first.sub.user_timezone),
          currency: m.currency,
        })),
        ...(actionToken ? { actionToken } : {}),
      });
      // user_id is out — the endpoint itself is already scoped to this user,
      // so the topic only needs to disambiguate this user's own due dates.
      topic = pushTopic(`bill-group-${first.nextDue}`);
    }

    const delivered = await deliverPushPayload(
      env,
      members,
      pushSubs,
      payload,
      vapid,
      urgency,
      topic
    );

    if (delivered) {
      sent += group.length;
    } else {
      // Delivery failed for every endpoint — release the claim so the next
      // cron tick retries instead of treating this as permanently sent.
      for (const c of group) await releaseNotificationClaim(env, c.sub, c.notificationKey);
      skipped += group.length;
    }
  }

  return { sent, skipped };
}

async function releaseNotificationClaim(
  env: Env,
  sub: SubscriptionRow,
  notificationKey: string
): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM notification_log WHERE user_id = ? AND subscription_id = ? AND notification_key = ?`
  )
    .bind(sub.user_id, sub.id, notificationKey)
    .run();
}
