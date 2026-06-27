import { sendNotification } from "web-push-neo";
import type { Env, PushSubscriptionRow, SubscriptionRow } from "./env";
import { daysUntilNextDue, nextDueIsoDate } from "./due-dates";

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

/** Whether a subscription should receive a push this cron tick. */
export function shouldNotifyNow(sub: SubscriptionRow, now = new Date()): boolean {
  const daysLeft = daysUntilNextDue(sub, now);
  if (daysLeft == null) return false;
  // Include overdue up to 7 days + upcoming within notify_days_before
  if (daysLeft < -7 || daysLeft > sub.notify_days_before) return false;
  const hour = sub.notify_hour ?? 9;
  return now.getUTCHours() === hour;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export async function sendDueNotifications(env: Env): Promise<{ sent: number; skipped: number }> {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    return { sent: 0, skipped: 0 };
  }

  const subject = env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  const { results: subs } = await env.DB.prepare(
    `SELECT * FROM subscriptions WHERE deleted_at IS NULL`,
  ).all<SubscriptionRow>();

  let sent = 0;
  let skipped = 0;
  const now = new Date();

  for (const sub of subs ?? []) {
    const daysLeft = daysUntilNextDue(sub, now);
    if (!shouldNotifyNow(sub, now)) {
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
       WHERE user_id = ? AND subscription_id = ? AND notification_key = ?`,
    )
      .bind(sub.user_id, sub.id, notificationKey)
      .first();

    if (alreadySent) {
      skipped++;
      continue;
    }

    const { results: pushSubs } = await env.DB.prepare(
      `SELECT * FROM push_subscriptions WHERE user_id = ?`,
    )
      .bind(sub.user_id)
      .all<PushSubscriptionRow>();

    if (!pushSubs?.length) {
      skipped++;
      continue;
    }

    const payload = JSON.stringify({
      title: daysLeft < 0 ? "Pago vencido" : "Recordatorio de pago",
      body: formatDueMessage(sub, daysLeft),
      url: "/",
    });

    let delivered = false;
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
            urgency: daysLeft <= 0 ? "high" : "normal",
            topic: `bill-${sub.id}`,
          },
        );
        delivered = true;
      } catch {
        /* expired subscription */
      }
    }

    if (delivered) {
      await env.DB.prepare(
        `INSERT INTO notification_log (id, user_id, subscription_id, notification_key)
         VALUES (?, ?, ?, ?)`,
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
