import type { Env } from "./env";
import { error, json } from "./env";

export async function getUserSettings(
  db: D1Database,
  userId: string,
): Promise<Response> {
  const user = await db
    .prepare(
      `SELECT id, email, budget_limit, email_reminders FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<{
      id: string;
      email: string | null;
      budget_limit: number | null;
      email_reminders: number;
    }>();

  if (!user) return error("Usuario no encontrado", 404);

  return json({
    budget_limit: user.budget_limit,
    email_reminders: user.email_reminders === 1,
    email: user.email,
  });
}

export async function updateUserSettings(
  request: Request,
  db: D1Database,
  userId: string,
): Promise<Response> {
  const body = (await request.json()) as {
    budget_limit?: number | null;
    email_reminders?: boolean;
  };

  if (body.budget_limit != null && (!Number.isFinite(body.budget_limit) || body.budget_limit < 0)) {
    return error("budget_limit inválido");
  }

  const updates: string[] = [];
  const values: (number | string | null)[] = [];

  if (body.budget_limit !== undefined) {
    updates.push("budget_limit = ?");
    values.push(body.budget_limit);
  }
  if (body.email_reminders !== undefined) {
    updates.push("email_reminders = ?");
    values.push(body.email_reminders ? 1 : 0);
  }

  if (updates.length === 0) return getUserSettings(db, userId);

  values.push(userId);
  await db
    .prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  return getUserSettings(db, userId);
}

export async function exportUserData(
  db: D1Database,
  userId: string,
): Promise<Response> {
  const { results: subscriptions } = await db
    .prepare(`SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all();

  const { results: payments } = await db
    .prepare(
      `SELECT pr.*, s.name AS subscription_name
       FROM payment_records pr
       LEFT JOIN subscriptions s ON s.id = pr.subscription_id
       WHERE pr.user_id = ?
       ORDER BY pr.paid_at DESC`,
    )
    .bind(userId)
    .all();

  const user = await db
    .prepare(`SELECT id, email, budget_limit, email_reminders, created_at FROM users WHERE id = ?`)
    .bind(userId)
    .first();

  const payload = {
    exported_at: new Date().toISOString(),
    user,
    subscriptions: subscriptions ?? [],
    payments: payments ?? [],
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="bills-export.json"',
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function healthCheck(env: Env): Promise<Response> {
  let dbOk = false;
  try {
    await env.DB.prepare(`SELECT 1`).first();
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const vapidOk =
    !!env.VAPID_PUBLIC_KEY &&
    env.VAPID_PUBLIC_KEY !== "REPLACE_WITH_VAPID_PUBLIC_KEY" &&
    !!env.VAPID_PRIVATE_KEY;

  return json({
    ok: dbOk,
    service: "bills-pwa",
    version: "2.0.0",
    db: dbOk,
    push: vapidOk,
    email: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
    time: new Date().toISOString(),
  });
}
