import { sendNotification } from 'web-push-neo';
import type { Env, PushSubscriptionRow, SubscriptionRow } from './env';
import { logError } from './env';
import { daysUntilNextDue, nextDueIsoDate } from './due-dates';
import { getHourInTimeZone, NOTIFY_TIMEZONE } from './timezone';

export { daysUntilNextDue };

export function formatDueMessage(sub: SubscriptionRow, daysLeft: number): string {
  const money = formatMoney(sub.amount, sub.currency);
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

/** Whether a subscription should receive a push this cron tick.
 *  notify_hour is wall-clock hour in the owning user's timezone (defaults to
 *  NOTIFY_TIMEZONE/Mexico City when the caller doesn't pass one).
 */
export function shouldNotifyNow(
  sub: SubscriptionRow,
  now = new Date(),
  timezone: string = NOTIFY_TIMEZONE
): boolean {
  const daysLeft = daysUntilNextDue(sub, now);
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

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export async function sendDueNotifications(env: Env): Promise<{ sent: number; skipped: number }> {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    return { sent: 0, skipped: 0 };
  }

  const subject = env.VAPID_SUBJECT ?? 'mailto:admin@example.com';
  const { results: subs } = await env.DB.prepare(
    `SELECT s.*, u.timezone AS user_timezone FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE s.deleted_at IS NULL`
  ).all<SubscriptionRow & { user_timezone: string }>();

  let sent = 0;
  let skipped = 0;
  const now = new Date();

  for (const sub of subs ?? []) {
    const daysLeft = daysUntilNextDue(sub, now);
    if (!shouldNotifyNow(sub, now, sub.user_timezone)) {
      skipped++;
      continue;
    }

    const nextDue = nextDueIsoDate(sub, now);
    if (!nextDue || daysLeft == null) {
      skipped++;
      continue;
    }

    const notificationKey = `${sub.id}:${nextDue}:${daysLeft}`;

    const alreadySent = await env.DB.prepare(
      `SELECT id FROM notification_log
       WHERE user_id = ? AND subscription_id = ? AND notification_key = ?`
    )
      .bind(sub.user_id, sub.id, notificationKey)
      .first();

    if (alreadySent) {
      skipped++;
      continue;
    }

    const { results: pushSubs } = await env.DB.prepare(
      `SELECT * FROM push_subscriptions WHERE user_id = ?`
    )
      .bind(sub.user_id)
      .all<PushSubscriptionRow>();

    if (!pushSubs?.length) {
      skipped++;
      continue;
    }

    const payload = JSON.stringify({
      title: daysLeft < 0 ? 'Pago vencido' : 'Recordatorio de pago',
      body: formatDueMessage(sub, daysLeft),
      url: '/',
    });

    let delivered = false;
    const expiredEndpointIds: string[] = [];
    for (const pushSub of pushSubs) {
      try {
        await sendNotification(
          {
            endpoint: pushSub.endpoint,
            keys: { p256dh: pushSub.p256dh, auth: pushSub.auth },
          },
          payload,
          {
            vapidDetails: {
              subject,
              publicKey: env.VAPID_PUBLIC_KEY,
              privateKey: env.VAPID_PRIVATE_KEY,
            },
            TTL: 86_400,
            urgency: daysLeft <= 0 ? 'high' : 'normal',
            topic: `bill-${sub.id}`,
          }
        );
        delivered = true;
        await recordAttempt(env, sub, 'sent');
      } catch (err) {
        // Per Web Push spec, a 410 Gone means the subscription is permanently expired.
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          expiredEndpointIds.push(pushSub.id);
          await recordAttempt(env, sub, 'expired', err);
        } else {
          // Anything else (network error, 429, 5xx, malformed VAPID, …) would
          // otherwise fail silently — log it so a persistent delivery problem
          // is actually visible instead of just "the user got no reminder."
          logError('push send failed', err, {
            subscriptionId: sub.id,
            userId: sub.user_id,
            status,
          });
          await recordAttempt(env, sub, 'failed', err);
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

    if (delivered) {
      await env.DB.prepare(
        `INSERT INTO notification_log (id, user_id, subscription_id, notification_key)
         VALUES (?, ?, ?, ?)`
      )
        .bind(crypto.randomUUID(), sub.user_id, sub.id, notificationKey)
        .run();
      sent++;
    } else {
      skipped++;
    }
  }

  return { sent, skipped };
}
