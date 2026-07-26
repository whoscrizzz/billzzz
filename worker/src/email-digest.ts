import type { Env, SubscriptionRow } from './env';
import { isUniqueConstraintError, logError } from './env';
import { daysUntilNextDue } from './due-dates';
import { currentDueAmount } from './due-dates-json';

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendEmailDigests(env: Env): Promise<{ sent: number }> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return { sent: 0 };

  const { results: users } = await env.DB.prepare(
    `SELECT id, email, timezone FROM users WHERE email_reminders = 1 AND email IS NOT NULL`
  ).all<{ id: string; email: string; timezone: string }>();

  let sent = 0;
  const now = new Date();

  for (const user of users ?? []) {
    const { results: subs } = await env.DB.prepare(
      `SELECT * FROM subscriptions WHERE user_id = ? AND deleted_at IS NULL`
    )
      .bind(user.id)
      .all<SubscriptionRow>();

    const dueSoon = (subs ?? [])
      .map((sub) => ({ sub, days: daysUntilNextDue(sub, now, user.timezone) }))
      .filter((x) => x.days != null && x.days >= -7 && x.days <= 7)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

    if (dueSoon.length === 0) continue;

    const todayKey = now.toISOString().slice(0, 10);
    const digestKey = `email:${user.id}:${todayKey}`;

    // Claim the slot up front via the table's UNIQUE constraint — atomic,
    // unlike the previous SELECT-then-INSERT-on-success (overlapping cron
    // ticks could both pass the SELECT and each send a duplicate digest).
    try {
      await env.DB.prepare(
        `INSERT INTO notification_log (id, user_id, subscription_id, notification_key)
         VALUES (?, ?, ?, ?)`
      )
        .bind(crypto.randomUUID(), user.id, user.id, digestKey)
        .run();
    } catch (err) {
      if (isUniqueConstraintError(err)) continue;
      throw err;
    }

    const formatWhen = (days: number) => {
      if (days < 0) return days === -1 ? 'vencido ayer' : `vencido hace ${Math.abs(days)} días`;
      if (days === 0) return 'hoy';
      if (days === 1) return 'mañana';
      return `en ${days} días`;
    };

    const lines = dueSoon.map(({ sub, days }) => {
      return `• ${sub.name} — ${formatMoney(currentDueAmount(sub), sub.currency)} (${formatWhen(days!)})`;
    });

    const appUrl = env.APP_URL ?? 'https://bills.whoscrizzz.com';
    const text = `Bills — pagos pendientes\n\n${lines.join('\n')}\n\nVer en la app: ${appUrl}`;
    const html = `<!DOCTYPE html><html lang="es"><body style="font-family:system-ui;background:#0a0a0f;color:#e2e8f0;padding:24px">
      <h2 style="color:#34d399;margin:0 0 16px">Pagos pendientes (7 días)</h2>
      <ul style="line-height:1.8;padding-left:20px">${dueSoon
        .map(
          ({ sub, days }) =>
            `<li><strong>${escapeHtml(sub.name)}</strong> — ${escapeHtml(formatMoney(currentDueAmount(sub), sub.currency))} <span style="color:#94a3b8">(${formatWhen(days!)})</span></li>`
        )
        .join('')}</ul>
      <p style="margin-top:24px"><a href="${appUrl}" style="color:#34d399">Abrir Bills</a></p>
    </body></html>`;

    let res: Response | null = null;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [user.email],
          subject: `Bills: ${dueSoon.length} pago(s) esta semana`,
          text,
          html,
        }),
      });
    } catch (err) {
      logError('resend digest fetch failed', err, { userId: user.id });
    }

    if (res?.ok) {
      sent++;
    } else {
      // Send failed (network error or non-2xx) — release the claim so the
      // next cron tick retries instead of treating this digest as sent.
      await env.DB.prepare(
        `DELETE FROM notification_log WHERE user_id = ? AND subscription_id = ? AND notification_key = ?`
      )
        .bind(user.id, user.id, digestKey)
        .run();
    }
  }

  return { sent };
}
