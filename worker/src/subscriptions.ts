import type { SubscriptionRow } from "./env";
import { error, json } from "./env";
import {
  advanceDueDateAfterPayment,
  daysUntilNextDue,
  deriveDueFields,
  isValidFrequency,
  nextDueIsoDate,
} from "./due-dates";
import { nearestDueFromList, serializeDueDates } from "./due-dates-json";

export async function listSubscriptions(
  db: D1Database,
  userId: string,
): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT * FROM subscriptions
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY due_day ASC, name ASC`,
    )
    .bind(userId)
    .all<SubscriptionRow>();

  return json({ subscriptions: results ?? [] });
}

export async function createSubscription(
  request: Request,
  db: D1Database,
  userId: string,
): Promise<Response> {
  const body = (await request.json()) as Partial<SubscriptionRow>;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (!body.name || body.amount == null || !body.frequency) {
    return error("name, amount, and frequency are required");
  }

  if (!isValidFrequency(body.frequency)) {
    return error("frequency must be weekly, monthly, yearly, or once");
  }

  const bodyExt = body as Partial<SubscriptionRow> & { due_dates?: string[] };

  let dueDay: number;
  let dueDate: string | null;
  let dueDatesJson: string | null = null;

  if (bodyExt.due_dates && bodyExt.due_dates.length > 0) {
    dueDatesJson = serializeDueDates(bodyExt.due_dates);
    const nearest = nearestDueFromList(bodyExt.due_dates);
    if (!nearest) return error("due_dates must contain valid YYYY-MM-DD values");
    dueDate = nearest;
    dueDay = Number(nearest.slice(8, 10));
  } else {
    const resolved = deriveDueFields(body.frequency!, body.due_date, body.due_day);
    if ("error" in resolved) return error(resolved.error);
    dueDay = resolved.due_day;
    dueDate = resolved.due_date;
  }

  const notifyHour = clampHour(body.notify_hour ?? 9);

  await db
    .prepare(
      `INSERT INTO subscriptions
       (id, user_id, name, amount, currency, due_day, frequency, due_date, due_dates, category, notes,
        notify_days_before, notify_hour, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      body.name,
      body.amount,
      body.currency ?? "MXN",
      dueDay,
      body.frequency,
      dueDate,
      dueDatesJson,
      body.category ?? null,
      body.notes ?? null,
      body.notify_days_before ?? 1,
      notifyHour,
      now,
      now,
    )
    .run();

  return json({ id }, 201);
}

export async function updateSubscription(
  request: Request,
  db: D1Database,
  userId: string,
  id: string,
): Promise<Response> {
  const body = (await request.json()) as Partial<SubscriptionRow>;
  const now = new Date().toISOString();

  if (body.frequency && !isValidFrequency(body.frequency)) {
    return error("frequency must be weekly, monthly, yearly, or once");
  }

  const bodyExt = body as Partial<SubscriptionRow> & { due_dates?: string[] };
  let dueDatesUpdate: string | null | undefined;
  if (bodyExt.due_dates !== undefined) {
    dueDatesUpdate = bodyExt.due_dates.length > 0 ? serializeDueDates(bodyExt.due_dates) : null;
  }

  const result = await db
    .prepare(
      `UPDATE subscriptions SET
         name = COALESCE(?, name),
         amount = COALESCE(?, amount),
         currency = COALESCE(?, currency),
         due_day = COALESCE(?, due_day),
         frequency = COALESCE(?, frequency),
         due_date = COALESCE(?, due_date),
         due_dates = COALESCE(?, due_dates),
         category = COALESCE(?, category),
         notes = COALESCE(?, notes),
         notify_days_before = COALESCE(?, notify_days_before),
         notify_hour = COALESCE(?, notify_hour),
         snoozed_until = COALESCE(?, snoozed_until),
         updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    )
    .bind(
      body.name ?? null,
      body.amount ?? null,
      body.currency ?? null,
      body.due_day ?? null,
      body.frequency ?? null,
      body.due_date ?? null,
      dueDatesUpdate ?? null,
      body.category ?? null,
      body.notes ?? null,
      body.notify_days_before ?? null,
      body.notify_hour ?? null,
      body.snoozed_until ?? null,
      now,
      id,
      userId,
    )
    .run();

  if (result.meta.changes === 0) {
    return error("Subscription not found", 404);
  }

  return json({ ok: true });
}

export async function markSubscriptionPaid(
  request: Request,
  db: D1Database,
  userId: string,
  id: string,
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    notes?: string;
    amount?: number;
    paid_at?: string;
  };

  const sub = await db
    .prepare(`SELECT * FROM subscriptions WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .bind(id, userId)
    .first<SubscriptionRow>();

  if (!sub) return error("Subscription not found", 404);

  let paidAt = new Date().toISOString();
  if (body.paid_at && /^\d{4}-\d{2}-\d{2}/.test(body.paid_at)) {
    paidAt = new Date(body.paid_at).toISOString();
  }
  const amount = body.amount ?? sub.amount;
  const recordId = crypto.randomUUID();

  const paidAtDate = new Date(paidAt);
  const advanced = advanceDueDateAfterPayment(sub, paidAtDate);

  if (advanced === null) {
    await db.batch([
      db
        .prepare(
          `INSERT INTO payment_records (id, user_id, subscription_id, amount, currency, paid_at, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(recordId, userId, id, amount, sub.currency, paidAt, body.notes ?? null),
      db
        .prepare(
          `UPDATE subscriptions SET last_paid_at = ?, deleted_at = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(paidAt, paidAt, paidAt, id),
    ]);
    return json({ ok: true, paid_at: paidAt, archived: true });
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO payment_records (id, user_id, subscription_id, amount, currency, paid_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(recordId, userId, id, amount, sub.currency, paidAt, body.notes ?? null),
    db
      .prepare(
        `UPDATE subscriptions SET
           last_paid_at = ?,
           due_date = ?,
           due_day = ?,
           due_dates = ?,
           snoozed_until = NULL,
           updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        paidAt,
        advanced.due_date,
        advanced.due_day,
        advanced.due_dates,
        paidAt,
        id,
      ),
  ]);

  return json({
    ok: true,
    paid_at: paidAt,
    archived: false,
    subscription: {
      due_date: advanced.due_date,
      due_day: advanced.due_day,
      due_dates: advanced.due_dates,
      snoozed_until: null,
      last_paid_at: paidAt,
    },
  });
}

export async function listPaymentRecords(
  db: D1Database,
  userId: string,
): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT pr.id, pr.subscription_id, pr.amount, pr.currency, pr.paid_at, pr.notes,
              s.name AS subscription_name
       FROM payment_records pr
       LEFT JOIN subscriptions s ON s.id = pr.subscription_id
       WHERE pr.user_id = ?
       ORDER BY pr.paid_at DESC
       LIMIT 30`,
    )
    .bind(userId)
    .all<{
      id: string;
      subscription_id: string;
      amount: number;
      currency: string;
      paid_at: string;
      notes: string | null;
      subscription_name: string | null;
    }>();

  return json({ payments: results ?? [] });
}

export async function deleteSubscription(
  db: D1Database,
  userId: string,
  id: string,
): Promise<Response> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE subscriptions SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    )
    .bind(now, now, id, userId)
    .run();

  if (result.meta.changes === 0) {
    return error("Subscription not found", 404);
  }

  return json({ ok: true });
}

export async function snoozeSubscription(
  request: Request,
  db: D1Database,
  userId: string,
  id: string,
): Promise<Response> {
  const body = (await request.json()) as { days?: number };
  const days = body.days ?? 3;
  if (days < 1 || days > 90) return error("days must be 1–90");

  const sub = await db
    .prepare(`SELECT id FROM subscriptions WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .bind(id, userId)
    .first();

  if (!sub) return error("Subscription not found", 404);

  const until = new Date();
  until.setUTCDate(until.getUTCDate() + days);
  const snoozedUntil = until.toISOString().slice(0, 10);
  const now = new Date().toISOString();

  await db
    .prepare(`UPDATE subscriptions SET snoozed_until = ?, updated_at = ? WHERE id = ?`)
    .bind(snoozedUntil, now, id)
    .run();

  return json({ ok: true, snoozed_until: snoozedUntil });
}

function clampHour(hour: number): number {
  return Math.min(Math.max(Math.round(hour), 0), 23);
}

export async function savePushSubscription(
  request: Request,
  db: D1Database,
  userId: string,
): Promise<Response> {
  const body = (await request.json()) as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return error("Invalid push subscription payload");
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth`,
    )
    .bind(id, userId, body.endpoint, body.keys.p256dh, body.keys.auth)
    .run();

  return json({ ok: true }, 201);
}

export { daysUntilNextDue, nextDueIsoDate };
