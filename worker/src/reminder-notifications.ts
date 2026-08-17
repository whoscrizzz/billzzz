import { sendNotification } from 'web-push-neo';
import type { Env, PushSubscriptionRow, ReminderRow } from './env';
import { logError, pushTopic } from './env';

/** Manda un push a todos los endpoints de un usuario para un grupo de
 * recordatorios ya vencidos. A diferencia de deliverPushPayload en
 * notifications.ts, no escribe notification_attempts — esa tabla tiene
 * `subscription_id TEXT NOT NULL` sin polimorfismo de tipo de entidad, y
 * /notifications/health es un diagnóstico pensado para suscripciones. */
async function deliverReminderPush(
  env: Env,
  reminders: ReminderRow[],
  pushSubs: PushSubscriptionRow[],
  payload: string,
  vapid: { subject: string; publicKey: string; privateKey: string }
): Promise<boolean> {
  let delivered = false;
  const expiredEndpointIds: string[] = [];

  for (const pushSub of pushSubs) {
    try {
      await sendNotification(
        { endpoint: pushSub.endpoint, keys: { p256dh: pushSub.p256dh, auth: pushSub.auth } },
        payload,
        {
          vapidDetails: vapid,
          TTL: 86_400,
          urgency: 'normal',
          // user_id is out — the endpoint itself is already scoped to this
          // user, and pushTopic caps at 32 chars (RFC 8030) which a raw
          // UUID alone blows past.
          topic: pushTopic('reminders'),
        }
      );
      delivered = true;
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        expiredEndpointIds.push(pushSub.id);
      } else {
        logError('reminder push send failed', err, {
          reminderIds: reminders.map((r) => r.id),
          userId: reminders[0]?.user_id,
          status,
        });
      }
    }
  }

  if (expiredEndpointIds.length > 0) {
    await env.DB.batch(
      expiredEndpointIds.map((id) =>
        env.DB.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).bind(id)
      )
    );
  }

  return delivered;
}

async function releaseReminderClaims(env: Env, reminders: ReminderRow[]): Promise<void> {
  await env.DB.batch(
    reminders.map((r) =>
      env.DB.prepare(`UPDATE reminders SET notified_at = NULL WHERE id = ?`).bind(r.id)
    )
  );
}

/** Cron de recordatorios — llamado desde scheduled() en index.ts junto a
 * sendDueNotifications. Un recordatorio no es recurrente (a diferencia de
 * una suscripción), así que el claim de dedup es un UPDATE condicional
 * sobre su propia fila (notified_at) en vez del INSERT+UNIQUE de
 * notification_log: no hay "próxima ocurrencia" que distinguir con una
 * notification_key compuesta, la fila misma alcanza como mutex entre ticks
 * de cron superpuestos. */
export async function sendDueReminders(env: Env): Promise<{ sent: number; skipped: number }> {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    return { sent: 0, skipped: 0 };
  }

  const vapid = {
    subject: env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  const now = new Date().toISOString();

  // Resuelve usuarios sin pasar por getSessionUserId (es un cron) — filtra
  // disabled igual que sendDueNotifications, por la misma regla de revocación.
  const { results: due } = await env.DB.prepare(
    `SELECT r.* FROM reminders r
     JOIN users u ON u.id = r.user_id
     WHERE r.done = 0 AND r.notified_at IS NULL AND r.trashed_at IS NULL
       AND r.due_at <= ? AND u.disabled = 0`
  )
    .bind(now)
    .all<ReminderRow>();

  let sent = 0;
  let skipped = 0;

  const claimed: ReminderRow[] = [];
  for (const reminder of due ?? []) {
    const result = await env.DB.prepare(
      `UPDATE reminders SET notified_at = ? WHERE id = ? AND notified_at IS NULL`
    )
      .bind(now, reminder.id)
      .run();
    if (result.meta.changes === 1) {
      claimed.push(reminder);
    } else {
      skipped++;
    }
  }

  const groups = new Map<string, ReminderRow[]>();
  for (const r of claimed) {
    const list = groups.get(r.user_id);
    if (list) list.push(r);
    else groups.set(r.user_id, [r]);
  }

  for (const [userId, reminders] of groups) {
    const { results: pushSubs } = await env.DB.prepare(
      `SELECT * FROM push_subscriptions WHERE user_id = ?`
    )
      .bind(userId)
      .all<PushSubscriptionRow>();

    if (!pushSubs?.length) {
      await releaseReminderClaims(env, reminders);
      skipped += reminders.length;
      continue;
    }

    const payload = JSON.stringify(
      reminders.length === 1
        ? { title: 'Recordatorio', body: reminders[0]!.title, url: '/?p=notes' }
        : {
            title: 'Recordatorios',
            body: `${reminders.length} recordatorios pendientes`,
            url: '/?p=notes',
          }
    );

    const delivered = await deliverReminderPush(env, reminders, pushSubs, payload, vapid);

    if (delivered) {
      sent += reminders.length;
    } else {
      await releaseReminderClaims(env, reminders);
      skipped += reminders.length;
    }
  }

  return { sent, skipped };
}
