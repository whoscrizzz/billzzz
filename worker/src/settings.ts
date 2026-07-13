import type { Env } from './env';
import { error, json, makeCorsHeaders } from './env';
import { isValidFrequency } from './due-dates';

const IMPORT_ROW_LIMIT = 500;

export async function getUserSettings(db: D1Database, userId: string): Promise<Response> {
  const user = await db
    .prepare(`SELECT id, email, budget_limit, email_reminders FROM users WHERE id = ?`)
    .bind(userId)
    .first<{
      id: string;
      email: string | null;
      budget_limit: number | null;
      email_reminders: number;
    }>();

  if (!user) return error('Usuario no encontrado', 404);

  const sessionCount = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > datetime('now')`
    )
    .bind(userId)
    .first<{ n: number }>();

  return json({
    budget_limit: user.budget_limit,
    email_reminders: user.email_reminders === 1,
    email: user.email,
    active_sessions: sessionCount?.n ?? 1,
  });
}

export async function updateUserSettings(
  request: Request,
  db: D1Database,
  userId: string
): Promise<Response> {
  const body = (await request.json()) as {
    budget_limit?: number | null;
    email_reminders?: boolean;
  };

  if (body.budget_limit != null && (!Number.isFinite(body.budget_limit) || body.budget_limit < 0)) {
    return error('budget_limit inválido');
  }

  const updates: string[] = [];
  const values: (number | string | null)[] = [];

  if (body.budget_limit !== undefined) {
    updates.push('budget_limit = ?');
    values.push(body.budget_limit);
  }
  if (body.email_reminders !== undefined) {
    updates.push('email_reminders = ?');
    values.push(body.email_reminders ? 1 : 0);
  }

  if (updates.length === 0) return getUserSettings(db, userId);

  values.push(userId);
  await db
    .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return getUserSettings(db, userId);
}

export async function exportUserData(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const db = env.DB;
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
       ORDER BY pr.paid_at DESC`
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
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="bills-export.json"',
      ...makeCorsHeaders(env, request),
    },
  });
}

export async function importUserData(
  request: Request,
  db: D1Database,
  userId: string
): Promise<Response> {
  const body = (await request.json().catch(() => ({}) as { subscriptions?: unknown[] })) as {
    subscriptions?: unknown[];
  };
  const rows = body.subscriptions;
  if (!Array.isArray(rows)) {
    return error('subscriptions array required');
  }
  if (rows.length > IMPORT_ROW_LIMIT) {
    return error(`Máximo ${IMPORT_ROW_LIMIT} suscripciones por importación`, 400);
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const amount = typeof row.amount === 'number' ? row.amount : parseFloat(String(row.amount));
    const frequency = typeof row.frequency === 'string' ? row.frequency : '';
    if (!name || !Number.isFinite(amount) || !isValidFrequency(frequency)) continue;

    const id = crypto.randomUUID();
    let dueDay = typeof row.due_day === 'number' ? row.due_day : 1;
    let dueDate = typeof row.due_date === 'string' ? row.due_date : null;
    let dueDatesJson: string | null = null;

    if (typeof row.due_dates === 'string' && row.due_dates) {
      dueDatesJson = row.due_dates;
      try {
        const parsed = JSON.parse(row.due_dates) as string[];
        if (Array.isArray(parsed) && parsed[0]) {
          dueDate = parsed[0];
          dueDay = Number(parsed[0].slice(8, 10));
        }
      } catch {
        /* keep defaults */
      }
    }

    statements.push(
      db
        .prepare(
          `INSERT INTO subscriptions
           (id, user_id, name, amount, currency, due_day, frequency, due_date, due_dates, category, notes,
            notify_days_before, notify_hour, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          userId,
          name,
          amount,
          typeof row.currency === 'string' ? row.currency : 'MXN',
          dueDay,
          frequency,
          dueDate,
          dueDatesJson,
          typeof row.category === 'string' ? row.category : null,
          typeof row.notes === 'string' ? row.notes : null,
          typeof row.notify_days_before === 'number' ? row.notify_days_before : 1,
          typeof row.notify_hour === 'number' ? row.notify_hour : 9,
          now,
          now
        )
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return json({ ok: true, imported: statements.length });
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
    env.VAPID_PUBLIC_KEY !== 'REPLACE_WITH_VAPID_PUBLIC_KEY' &&
    !!env.VAPID_PRIVATE_KEY;

  return json({
    ok: dbOk,
    service: 'bills-pwa',
    version: env.APP_VERSION,
    db: dbOk,
    push: vapidOk,
    email: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
    time: new Date().toISOString(),
  });
}
