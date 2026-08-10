import type { SubscriptionRow } from './env';
import { error, isUniqueConstraintError, isValidUuid, json } from './env';
import {
  claimNotificationAction,
  getNotificationAction,
  releaseNotificationAction,
} from './notification-actions';
import {
  advanceDueDateAfterPayment,
  daysUntilNextDue,
  deriveDueFields,
  formatIsoDate,
  isValidFrequency,
  isValidIntervalUnit,
  nextDueDayFrom,
  nextDueIsoDate,
} from './due-dates';
import {
  type DueDateEntry,
  isValidDueDay,
  nearestDueFromList,
  parseDueDaysList,
  serializeDueDates,
  serializeDueDays,
} from './due-dates-json';

const MAX_NAME_LEN = 120;
const MAX_CATEGORY_LEN = 120;
const MAX_NOTES_LEN = 2000;
const MAX_CURRENCY_LEN = 10;

/** Shared field validation for create/update — cheap sanity limits, not business rules. */
function validateSubscriptionFields(body: {
  name?: string;
  category?: string | null;
  notes?: string | null;
  amount?: number;
  currency?: string;
}): string | null {
  if (body.name != null && body.name.length > MAX_NAME_LEN) {
    return `El nombre debe tener ${MAX_NAME_LEN} caracteres o menos`;
  }
  if (body.category != null && body.category.length > MAX_CATEGORY_LEN) {
    return `La categoría debe tener ${MAX_CATEGORY_LEN} caracteres o menos`;
  }
  if (body.notes != null && body.notes.length > MAX_NOTES_LEN) {
    return `Las notas deben tener ${MAX_NOTES_LEN} caracteres o menos`;
  }
  if (body.amount != null && (!Number.isFinite(body.amount) || body.amount < 0)) {
    return 'El monto debe ser un número válido y no negativo';
  }
  if (
    body.currency != null &&
    (body.currency.length === 0 || body.currency.length > MAX_CURRENCY_LEN)
  ) {
    return `La moneda debe tener entre 1 y ${MAX_CURRENCY_LEN} caracteres`;
  }
  return null;
}

/** Cada fecha personalizada puede traer su propio monto — mismo límite que `amount`. */
function validateDueDateEntries(entries: DueDateEntry[] | undefined): string | null {
  if (!entries) return null;
  for (const e of entries) {
    if (e.amount != null && (!Number.isFinite(e.amount) || e.amount < 0)) {
      return 'El monto de cada fecha debe ser un número válido y no negativo';
    }
  }
  return null;
}

/** Fase 3: recurrencia por intervalo y varios días del mes. */
function validateRecurrenceFields(body: {
  frequency?: string;
  interval_count?: number | null;
  interval_unit?: string | null;
  due_days?: number[];
}): string | null {
  if (body.frequency === 'interval') {
    if (
      body.interval_count == null ||
      !Number.isInteger(body.interval_count) ||
      body.interval_count < 1
    ) {
      return 'interval_count debe ser un entero mayor o igual a 1';
    }
    if (!body.interval_unit || !isValidIntervalUnit(body.interval_unit)) {
      return "interval_unit debe ser 'day', 'week' o 'month'";
    }
  }
  if (body.due_days) {
    for (const d of body.due_days) {
      if (!isValidDueDay(d)) return 'due_days debe contener enteros entre 1 y 31';
    }
  }
  return null;
}

export async function listSubscriptions(db: D1Database, userId: string): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT * FROM subscriptions
       WHERE user_id = ? AND deleted_at IS NULL AND trashed_at IS NULL
       ORDER BY due_day ASC, name ASC`
    )
    .bind(userId)
    .all<SubscriptionRow>();

  return json({ subscriptions: results ?? [] });
}

export async function createSubscription(
  request: Request,
  db: D1Database,
  userId: string
): Promise<Response> {
  const body = (await request.json()) as Partial<SubscriptionRow> & { id?: string };
  // Id generado por el cliente (offline queue / retry) para que el create
  // sea idempotente — ver el catch de abajo. Si no viene o no es un UUID
  // válido, se genera acá como antes.
  const id = isValidUuid(body.id) ? body.id : crypto.randomUUID();
  const now = new Date().toISOString();

  if (!body.name || body.amount == null || !body.frequency) {
    return error('name, amount, and frequency are required');
  }

  if (!isValidFrequency(body.frequency)) {
    return error('frequency must be weekly, monthly, yearly, once, or interval');
  }

  const fieldError = validateSubscriptionFields(body);
  if (fieldError) return error(fieldError);

  const bodyExt = body as Partial<SubscriptionRow> & {
    due_dates?: DueDateEntry[];
    due_days?: number[];
  };
  const dueDatesError = validateDueDateEntries(bodyExt.due_dates);
  if (dueDatesError) return error(dueDatesError);
  const recurrenceError = validateRecurrenceFields(bodyExt);
  if (recurrenceError) return error(recurrenceError);

  let dueDay: number;
  let dueDate: string | null;
  let dueDatesJson: string | null = null;
  let dueDaysJson: string | null = null;

  if (bodyExt.due_dates && bodyExt.due_dates.length > 0) {
    dueDatesJson = serializeDueDates(bodyExt.due_dates);
    const nearest = nearestDueFromList(bodyExt.due_dates);
    if (!nearest) return error('due_dates must contain valid YYYY-MM-DD values');
    dueDate = nearest;
    dueDay = Number(nearest.slice(8, 10));
  } else if (bodyExt.due_days && bodyExt.due_days.length > 0) {
    const daysList = parseDueDaysList({ due_days: bodyExt.due_days });
    dueDaysJson = serializeDueDays(daysList);
    const nearest = nextDueDayFrom(daysList, formatIsoDate(new Date(now)));
    dueDate = nearest;
    dueDay = Number(nearest.slice(8, 10));
  } else {
    const resolved = deriveDueFields(body.frequency!, body.due_date, body.due_day);
    if ('error' in resolved) return error(resolved.error);
    dueDay = resolved.due_day;
    dueDate = resolved.due_date;
  }

  const notifyHour = clampHour(body.notify_hour ?? 9);

  try {
    await db
      .prepare(
        `INSERT INTO subscriptions
         (id, user_id, name, amount, currency, due_day, frequency, due_date, due_dates, due_days,
          interval_count, interval_unit, category, notes, notify_days_before, notify_hour,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        userId,
        body.name,
        body.amount,
        body.currency ?? 'MXN',
        dueDay,
        body.frequency,
        dueDate,
        dueDatesJson,
        dueDaysJson,
        body.interval_count ?? null,
        body.interval_unit ?? null,
        body.category ?? null,
        body.notes ?? null,
        body.notify_days_before ?? 1,
        notifyHour,
        now,
        now
      )
      .run();
  } catch (err) {
    // El id ya existe — un retry de red o una reconexión disparó el mismo
    // create dos veces. Dedup-is-a-claim vía la PRIMARY KEY, mismo
    // principio que notification_log: si la fila es del mismo usuario, el
    // create ya se aplicó antes, así que responde éxito en vez de duplicar.
    if (isUniqueConstraintError(err)) {
      const existing = await db
        .prepare(`SELECT id FROM subscriptions WHERE id = ? AND user_id = ?`)
        .bind(id, userId)
        .first<{ id: string }>();
      if (existing) return json({ id: existing.id }, 200);
    }
    throw err;
  }

  return json({ id }, 201);
}

export async function updateSubscription(
  request: Request,
  db: D1Database,
  userId: string,
  id: string
): Promise<Response> {
  const body = (await request.json()) as Partial<SubscriptionRow> & {
    due_dates?: DueDateEntry[];
    due_days?: number[];
  };
  const now = new Date().toISOString();

  if (body.frequency && !isValidFrequency(body.frequency)) {
    return error('frequency must be weekly, monthly, yearly, once, or interval');
  }

  const fieldError = validateSubscriptionFields(body);
  if (fieldError) return error(fieldError);
  const dueDatesError = validateDueDateEntries(body.due_dates);
  if (dueDatesError) return error(dueDatesError);
  const recurrenceError = validateRecurrenceFields(body);
  if (recurrenceError) return error(recurrenceError);

  const sets: string[] = [];
  const binds: (string | number | null)[] = [];

  const assign = (column: string, value: string | number | null | undefined) => {
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      binds.push(value);
    }
  };

  assign('name', body.name);
  assign('amount', body.amount);
  assign('currency', body.currency);
  assign('frequency', body.frequency);
  if (body.frequency === 'weekly') {
    const resolved = deriveDueFields('weekly', body.due_date, body.due_day);
    if ('error' in resolved) return error(resolved.error);
    assign('due_date', resolved.due_date);
    assign('due_day', resolved.due_day);
  } else {
    assign('due_date', body.due_date);
    if (body.due_date !== undefined && body.due_day === undefined && body.due_date) {
      assign('due_day', parseInt(body.due_date.slice(8, 10), 10));
    } else {
      assign('due_day', body.due_day);
    }
  }
  assign('category', body.category);
  assign('notes', body.notes);
  assign('notify_days_before', body.notify_days_before);
  assign('notify_hour', body.notify_hour === undefined ? undefined : clampHour(body.notify_hour));
  if ('snoozed_until' in body) {
    assign('snoozed_until', body.snoozed_until);
  }
  if (body.due_dates !== undefined) {
    assign('due_dates', body.due_dates.length > 0 ? serializeDueDates(body.due_dates) : null);
  }
  if (body.due_days !== undefined) {
    assign(
      'due_days',
      body.due_days.length > 0
        ? serializeDueDays(parseDueDaysList({ due_days: body.due_days }))
        : null
    );
  }
  assign('interval_count', body.interval_count);
  assign('interval_unit', body.interval_unit);

  if (sets.length === 0) {
    return error('No fields to update');
  }

  sets.push('updated_at = ?');
  binds.push(now);
  binds.push(id, userId);

  const result = await db
    .prepare(
      `UPDATE subscriptions SET ${sets.join(', ')}
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND trashed_at IS NULL`
    )
    .bind(...binds)
    .run();

  if (result.meta.changes === 0) {
    return error('Subscription not found', 404);
  }

  return json({ ok: true });
}

/** Arma (sin ejecutar) las 2 statements de un pago: INSERT payment_record +
 * UPDATE subscription (avanza la recurrencia, o archiva si `advanced` es
 * null — ver `advanceDueDateAfterPayment`). Extraído de `markSubscriptionPaid`
 * para que `payAllSubscriptions` pueda juntar las de N suscripciones en un
 * solo `db.batch`, en vez de una transacción separada por cada una. */
function buildPayStatements(
  db: D1Database,
  userId: string,
  sub: SubscriptionRow,
  id: string,
  paidAt: string,
  amount: number,
  notes: string | null,
  recordId: string
): {
  statements: D1PreparedStatement[];
  advanced: ReturnType<typeof advanceDueDateAfterPayment>;
} {
  const advanced = advanceDueDateAfterPayment(sub, new Date(paidAt));

  const insertPayment = db
    .prepare(
      `INSERT INTO payment_records (id, user_id, subscription_id, amount, currency, paid_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(recordId, userId, id, amount, sub.currency, paidAt, notes);

  if (advanced === null) {
    return {
      statements: [
        insertPayment,
        db
          .prepare(
            `UPDATE subscriptions SET last_paid_at = ?, deleted_at = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`
          )
          .bind(paidAt, paidAt, paidAt, id, userId),
      ],
      advanced,
    };
  }

  return {
    statements: [
      insertPayment,
      db
        .prepare(
          `UPDATE subscriptions SET
             last_paid_at = ?,
             due_date = ?,
             due_day = ?,
             due_dates = ?,
             snoozed_until = NULL,
             updated_at = ?
           WHERE id = ? AND user_id = ?`
        )
        .bind(paidAt, advanced.due_date, advanced.due_day, advanced.due_dates, paidAt, id, userId),
    ],
    advanced,
  };
}

export async function markSubscriptionPaid(
  request: Request,
  db: D1Database,
  userId: string,
  id: string
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    notes?: string;
    amount?: number;
    paid_at?: string;
    notificationKey?: string;
  };

  if (body.notificationKey) {
    const existing = await getNotificationAction(db, body.notificationKey);
    if (existing) {
      if (existing.action !== 'pay') {
        return error('Ya se registró otra acción para este aviso', 409);
      }
      return json({
        ok: true,
        paid_at: existing.post_action_updated_at,
        paymentId: existing.result_payment_id,
        alreadyProcessed: true,
      });
    }
  }

  const sub = await db
    .prepare(
      `SELECT * FROM subscriptions
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND trashed_at IS NULL`
    )
    .bind(id, userId)
    .first<SubscriptionRow>();

  if (!sub) return error('Subscription not found', 404);

  let paidAt = new Date().toISOString();
  if (body.paid_at && /^\d{4}-\d{2}-\d{2}/.test(body.paid_at)) {
    const parsed = new Date(body.paid_at);
    if (Number.isNaN(parsed.getTime())) {
      return error('paid_at inválido');
    }
    paidAt = parsed.toISOString();
  }
  const amount = body.amount ?? sub.amount;
  const recordId = crypto.randomUUID();

  // Snapshot previo a la mutación — es lo único que le permite a /undo
  // restaurar al estado inmediato anterior en vez de a un valor arbitrario.
  const prevSnapshot = JSON.stringify({
    due_date: sub.due_date,
    due_day: sub.due_day,
    due_dates: sub.due_dates,
    last_paid_at: sub.last_paid_at,
    snoozed_until: sub.snoozed_until,
  });

  if (body.notificationKey) {
    const claimed = await claimNotificationAction(db, {
      notificationKey: body.notificationKey,
      userId,
      subscriptionId: id,
      action: 'pay',
      resultPaymentId: recordId,
      prevSnapshot,
      postActionUpdatedAt: paidAt,
    });
    if (!claimed) {
      // Perdió la carrera contra un request idéntico — leer y devolver lo
      // que ese otro ya aplicó, sin volver a insertar/avanzar nada acá.
      const existing = await getNotificationAction(db, body.notificationKey);
      return json({
        ok: true,
        paid_at: existing?.post_action_updated_at ?? paidAt,
        paymentId: existing?.result_payment_id ?? null,
        alreadyProcessed: true,
      });
    }
  }

  const { statements, advanced } = buildPayStatements(
    db,
    userId,
    sub,
    id,
    paidAt,
    amount,
    body.notes ?? null,
    recordId
  );

  try {
    await db.batch(statements);
  } catch (err) {
    if (body.notificationKey) await releaseNotificationAction(db, body.notificationKey);
    throw err;
  }

  if (advanced === null) {
    return json({ ok: true, paid_at: paidAt, archived: true, paymentId: recordId });
  }

  return json({
    ok: true,
    paid_at: paidAt,
    archived: false,
    paymentId: recordId,
    subscription: {
      due_date: advanced.due_date,
      due_day: advanced.due_day,
      due_dates: advanced.due_dates,
      snoozed_until: null,
      last_paid_at: paidAt,
    },
  });
}

export interface PayAllItemResult {
  subscriptionId: string;
  ok: boolean;
  paid_at?: string;
  paymentId?: string | null;
  alreadyProcessed?: boolean;
}

/** "Marcar todos" desde un push agrupado (Fase 6b) — mismo patrón claim-first
 * que markSubscriptionPaid, aplicado a N suscripciones del mismo usuario
 * dentro de un solo db.batch. `items` ya viene autorizado por
 * resolveGroupActionAuth (todas las subs pertenecen a userId). Nunca lleva
 * body de sesión (notes/amount/paid_at) — es una acción ciega del SW. */
export async function payAllSubscriptions(
  db: D1Database,
  userId: string,
  items: { subscriptionId: string; notificationKey: string }[]
): Promise<Response> {
  const paidAt = new Date().toISOString();
  const results: PayAllItemResult[] = [];
  const statements: D1PreparedStatement[] = [];
  const claimedKeys: string[] = [];

  for (const item of items) {
    const existing = await getNotificationAction(db, item.notificationKey);
    if (existing) {
      // Ya hay una acción registrada para este aviso. Si fue 'pay' (otro
      // request del mismo grupo, o el usuario ya lo había pagado individual),
      // se confirma como alreadyProcessed. Si fue otra cosa (p. ej. 'snooze'
      // por su propio notificationKey individual), no es un pago que
      // reportar — se omite en silencio, igual que una suscripción inexistente.
      if (existing.action === 'pay') {
        results.push({
          subscriptionId: item.subscriptionId,
          ok: true,
          alreadyProcessed: true,
          paid_at: existing.post_action_updated_at,
          paymentId: existing.result_payment_id,
        });
      }
      continue;
    }

    const sub = await db
      .prepare(
        `SELECT * FROM subscriptions
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND trashed_at IS NULL`
      )
      .bind(item.subscriptionId, userId)
      .first<SubscriptionRow>();
    if (!sub) continue;

    const recordId = crypto.randomUUID();
    const prevSnapshot = JSON.stringify({
      due_date: sub.due_date,
      due_day: sub.due_day,
      due_dates: sub.due_dates,
      last_paid_at: sub.last_paid_at,
      snoozed_until: sub.snoozed_until,
    });

    const claimed = await claimNotificationAction(db, {
      notificationKey: item.notificationKey,
      userId,
      subscriptionId: item.subscriptionId,
      action: 'pay',
      resultPaymentId: recordId,
      prevSnapshot,
      postActionUpdatedAt: paidAt,
    });

    if (!claimed) {
      // Perdió la carrera contra un request paralelo (otro tap, u otro
      // dispositivo drenando su propio outbox) — leer lo que ese ganó.
      const raced = await getNotificationAction(db, item.notificationKey);
      if (raced?.action === 'pay') {
        results.push({
          subscriptionId: item.subscriptionId,
          ok: true,
          alreadyProcessed: true,
          paid_at: raced.post_action_updated_at,
          paymentId: raced.result_payment_id,
        });
      }
      continue;
    }

    const { statements: subStatements } = buildPayStatements(
      db,
      userId,
      sub,
      item.subscriptionId,
      paidAt,
      sub.amount,
      null,
      recordId
    );
    statements.push(...subStatements);
    claimedKeys.push(item.notificationKey);
    results.push({
      subscriptionId: item.subscriptionId,
      ok: true,
      paid_at: paidAt,
      paymentId: recordId,
    });
  }

  try {
    if (statements.length > 0) await db.batch(statements);
  } catch (err) {
    for (const key of claimedKeys) await releaseNotificationAction(db, key);
    throw err;
  }

  return json({ ok: true, results });
}

export async function listPaymentRecords(db: D1Database, userId: string): Promise<Response> {
  const { results } = await db
    .prepare(
      // Fase 7b: pr.name/pr.category solo vienen llenos en gastos sueltos
      // (subscription_id NULL). El COALESCE mantiene la precedencia de
      // siempre — la suscripción manda cuando existe — y solo cae al campo
      // propio del pago cuando no hay ninguna a la que preguntarle.
      `SELECT pr.id, pr.subscription_id, pr.amount, pr.currency, pr.paid_at, pr.notes,
              COALESCE(s.name, pr.name, pr.subscription_id) AS subscription_name,
              COALESCE(s.category, pr.category) AS category,
              s.deleted_at AS subscription_deleted_at
       FROM payment_records pr
       LEFT JOIN subscriptions s ON s.id = pr.subscription_id
       WHERE pr.user_id = ?
       ORDER BY pr.paid_at DESC
       LIMIT 100`
    )
    .bind(userId)
    .all<{
      id: string;
      subscription_id: string | null;
      amount: number;
      currency: string;
      paid_at: string;
      notes: string | null;
      subscription_name: string | null;
      category: string | null;
      subscription_deleted_at: string | null;
    }>();

  return json({ payments: results ?? [] });
}

export async function deletePaymentRecord(
  db: D1Database,
  userId: string,
  id: string
): Promise<Response> {
  const result = await db
    .prepare(`DELETE FROM payment_records WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();

  if (result.meta.changes === 0) {
    return error('Registro no encontrado', 404);
  }

  return json({ ok: true });
}

export async function clearPaymentHistory(db: D1Database, userId: string): Promise<Response> {
  const result = await db
    .prepare(`DELETE FROM payment_records WHERE user_id = ?`)
    .bind(userId)
    .run();

  return json({ ok: true, deleted: result.meta.changes ?? 0 });
}

export async function listArchivedSubscriptions(db: D1Database, userId: string): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT * FROM subscriptions
       WHERE user_id = ? AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC
       LIMIT 50`
    )
    .bind(userId)
    .all<SubscriptionRow>();

  return json({ subscriptions: results ?? [] });
}

export async function restoreArchivedSubscription(
  db: D1Database,
  userId: string,
  id: string
): Promise<Response> {
  const sub = await db
    .prepare(
      `SELECT * FROM subscriptions
       WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL`
    )
    .bind(id, userId)
    .first<SubscriptionRow>();

  if (!sub) return error('Pago archivado no encontrado', 404);

  const now = new Date().toISOString();
  const lastPayment = await db
    .prepare(
      `SELECT id FROM payment_records
       WHERE subscription_id = ? AND user_id = ?
       ORDER BY paid_at DESC LIMIT 1`
    )
    .bind(id, userId)
    .first<{ id: string }>();

  const statements = [
    db
      .prepare(
        `UPDATE subscriptions SET deleted_at = NULL, last_paid_at = NULL, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .bind(now, id, userId),
  ];
  if (lastPayment) {
    statements.push(db.prepare(`DELETE FROM payment_records WHERE id = ?`).bind(lastPayment.id));
  }
  await db.batch(statements);

  return json({
    ok: true,
    subscription: { ...sub, deleted_at: null, last_paid_at: null, updated_at: now },
  });
}

export async function trashSubscription(
  db: D1Database,
  userId: string,
  id: string
): Promise<Response> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE subscriptions SET trashed_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND trashed_at IS NULL`
    )
    .bind(now, now, id, userId)
    .run();

  if (result.meta.changes === 0) {
    return error('Subscription not found', 404);
  }

  return json({ ok: true });
}

export async function listTrashedSubscriptions(db: D1Database, userId: string): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT * FROM subscriptions
       WHERE user_id = ? AND trashed_at IS NOT NULL
       ORDER BY trashed_at DESC
       LIMIT 50`
    )
    .bind(userId)
    .all<SubscriptionRow>();

  return json({ subscriptions: results ?? [] });
}

export async function restoreTrashedSubscription(
  db: D1Database,
  userId: string,
  id: string
): Promise<Response> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE subscriptions SET trashed_at = NULL, updated_at = ?
       WHERE id = ? AND user_id = ? AND trashed_at IS NOT NULL`
    )
    .bind(now, id, userId)
    .run();

  if (result.meta.changes === 0) {
    return error('Pago en la papelera no encontrado', 404);
  }

  const sub = await db
    .prepare(`SELECT * FROM subscriptions WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<SubscriptionRow>();

  return json({ ok: true, subscription: sub });
}

export async function snoozeSubscription(
  request: Request,
  db: D1Database,
  userId: string,
  id: string
): Promise<Response> {
  const body = (await request.json()) as { days?: number; notificationKey?: string };
  const days = body.days ?? 3;
  if (days < 1 || days > 90) return error('days must be 1–90');

  if (body.notificationKey) {
    const existing = await getNotificationAction(db, body.notificationKey);
    if (existing) {
      if (existing.action !== 'snooze') {
        return error('Ya se registró otra acción para este aviso', 409);
      }
      const prevSnapshot = JSON.parse(existing.prev_snapshot) as { snoozed_until: string | null };
      const currentSub = await db
        .prepare(`SELECT snoozed_until FROM subscriptions WHERE id = ? AND user_id = ?`)
        .bind(id, userId)
        .first<{ snoozed_until: string | null }>();
      return json({
        ok: true,
        snoozed_until: currentSub?.snoozed_until ?? null,
        prevSnoozedUntil: prevSnapshot.snoozed_until,
        alreadyProcessed: true,
      });
    }
  }

  const sub = await db
    .prepare(
      `SELECT id, snoozed_until FROM subscriptions
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND trashed_at IS NULL`
    )
    .bind(id, userId)
    .first<{ id: string; snoozed_until: string | null }>();

  if (!sub) return error('Subscription not found', 404);

  const until = new Date();
  until.setUTCDate(until.getUTCDate() + days);
  const snoozedUntil = until.toISOString().slice(0, 10);
  const now = new Date().toISOString();

  if (body.notificationKey) {
    const claimed = await claimNotificationAction(db, {
      notificationKey: body.notificationKey,
      userId,
      subscriptionId: id,
      action: 'snooze',
      resultPaymentId: null,
      prevSnapshot: JSON.stringify({ snoozed_until: sub.snoozed_until }),
      postActionUpdatedAt: now,
    });
    if (!claimed) {
      const existing = await getNotificationAction(db, body.notificationKey);
      const snapshot = existing
        ? (JSON.parse(existing.prev_snapshot) as { snoozed_until: string | null })
        : null;
      return json({
        ok: true,
        snoozed_until: snapshot?.snoozed_until ?? sub.snoozed_until,
        prevSnoozedUntil: snapshot?.snoozed_until ?? null,
        alreadyProcessed: true,
      });
    }
  }

  try {
    await db
      .prepare(
        `UPDATE subscriptions SET snoozed_until = ?, updated_at = ? WHERE id = ? AND user_id = ?`
      )
      .bind(snoozedUntil, now, id, userId)
      .run();
  } catch (err) {
    if (body.notificationKey) await releaseNotificationAction(db, body.notificationKey);
    throw err;
  }

  return json({ ok: true, snoozed_until: snoozedUntil, prevSnoozedUntil: sub.snoozed_until });
}

function clampHour(hour: number): number {
  return Math.min(Math.max(Math.round(hour), 0), 23);
}

export async function savePushSubscription(
  request: Request,
  db: D1Database,
  userId: string
): Promise<Response> {
  const body = (await request.json()) as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return error('Invalid push subscription payload');
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth`
    )
    .bind(id, userId, body.endpoint, body.keys.p256dh, body.keys.auth)
    .run();

  return json({ ok: true }, 201);
}

export async function getPushSubscriptionStatus(db: D1Database, userId: string): Promise<Response> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id = ?`)
    .bind(userId)
    .first<{ c: number }>();
  return json({ serverCount: row?.c ?? 0 });
}

export { daysUntilNextDue, nextDueIsoDate };
