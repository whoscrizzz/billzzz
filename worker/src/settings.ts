import type { Env, SubscriptionDbRow } from './env';
import { error, json, makeCorsHeaders } from './env';
import { isValidFrequency } from './due-dates';
import { parseDueDates, parseDueDaysList } from './due-dates-json';
import { subscriptionsToDto } from './db-v2';
import { isSupportedCurrency, toFxMicros, toMinorUnits } from './money';
import { normalizeSubscriptionRecurrence } from './subscriptions';
import { isValidTimezone, NOTIFY_TIMEZONE } from './timezone';

const IMPORT_ROW_LIMIT = 500;
const MAX_DISPLAY_NAME_LEN = 40;

export async function getUserSettings(db: D1Database, userId: string): Promise<Response> {
  const user = await db
    .prepare(
      `SELECT id, email, display_name, budget_limit, email_reminders, timezone, fx_usd_mxn FROM users WHERE id = ?`
    )
    .bind(userId)
    .first<{
      id: string;
      email: string | null;
      display_name: string | null;
      budget_limit: number | null;
      email_reminders: number;
      timezone: string;
      fx_usd_mxn: number | null;
    }>();

  if (!user) return error('Usuario no encontrado', 404);

  const sessionCount = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND unixepoch(expires_at) > unixepoch()`
    )
    .bind(userId)
    .first<{ n: number }>();

  return json({
    budget_limit: user.budget_limit,
    email_reminders: user.email_reminders === 1,
    email: user.email,
    display_name: user.display_name,
    timezone: user.timezone ?? NOTIFY_TIMEZONE,
    active_sessions: sessionCount?.n ?? 1,
    fx_usd_mxn: user.fx_usd_mxn,
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
    timezone?: string;
    display_name?: string | null;
    fx_usd_mxn?: number | null;
  };

  if (body.budget_limit != null && toMinorUnits(body.budget_limit) == null) {
    return error('budget_limit inválido');
  }
  if (body.timezone != null && !isValidTimezone(body.timezone)) {
    return error('Zona horaria no soportada');
  }
  if (body.display_name != null && body.display_name.length > MAX_DISPLAY_NAME_LEN) {
    return error(`El nombre debe tener ${MAX_DISPLAY_NAME_LEN} caracteres o menos`);
  }
  if (body.fx_usd_mxn != null && toFxMicros(body.fx_usd_mxn) == null) {
    return error('Tipo de cambio inválido');
  }

  const updates: string[] = [];
  const values: (number | string | null)[] = [];

  if (body.budget_limit !== undefined) {
    updates.push('budget_limit_minor = ?');
    values.push(body.budget_limit == null ? null : toMinorUnits(body.budget_limit));
  }
  if (body.fx_usd_mxn !== undefined) {
    updates.push('fx_usd_mxn_micros = ?');
    values.push(body.fx_usd_mxn == null ? null : toFxMicros(body.fx_usd_mxn));
  }
  if (body.email_reminders !== undefined) {
    updates.push('email_reminders = ?');
    values.push(body.email_reminders ? 1 : 0);
  }
  if (body.timezone !== undefined) {
    updates.push('timezone = ?');
    values.push(body.timezone);
  }
  if (body.display_name !== undefined) {
    updates.push('display_name = ?');
    values.push(body.display_name?.trim() || null);
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
    .all<SubscriptionDbRow>();

  const { results: payments } = await db
    .prepare(
      `SELECT pr.id, pr.subscription_id, pr.amount, pr.currency, pr.paid_at, pr.notes,
              pr.name, pr.category, pr.fx_usd_mxn, pr.created_at,
              COALESCE(s.name, pr.name) AS subscription_name
       FROM payment_records pr
       LEFT JOIN subscriptions s ON s.id = pr.subscription_id
       WHERE pr.user_id = ?
       ORDER BY pr.paid_at DESC`
    )
    .bind(userId)
    .all();

  const user = await db
    .prepare(
      `SELECT id, email, display_name, budget_limit, email_reminders, timezone, fx_usd_mxn,
              created_at
       FROM users WHERE id = ?`
    )
    .bind(userId)
    .first();

  const { results: notes } = await db
    .prepare(`SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC`)
    .bind(userId)
    .all();

  const { results: reminders } = await db
    .prepare(`SELECT * FROM reminders WHERE user_id = ? ORDER BY due_at ASC`)
    .bind(userId)
    .all();

  const payload = {
    schema_version: 2,
    exported_at: new Date().toISOString(),
    user,
    subscriptions: subscriptionsToDto(subscriptions),
    payments: payments ?? [],
    notes: notes ?? [],
    reminders: reminders ?? [],
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="bills-export.json"',
      ...makeCorsHeaders(env, request),
    },
  });
}

/** Notas del import viejo de Notes+ (standalone) llegan ya mapeadas al shape
 * canónico por el panel de import del cliente — acá solo se valida. */
function buildNoteStatements(
  db: D1Database,
  userId: string,
  rows: unknown[],
  now: string
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (!title) continue;

    statements.push(
      db
        .prepare(
          `INSERT INTO notes (id, user_id, title, body, category, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          userId,
          title,
          typeof row.body === 'string' ? row.body : '',
          typeof row.category === 'string' ? row.category : null,
          now,
          now
        )
    );
  }
  return statements;
}

function buildReminderStatements(
  db: D1Database,
  userId: string,
  rows: unknown[],
  now: string
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const dueAt = typeof row.due_at === 'string' ? row.due_at : '';
    if (!title || Number.isNaN(new Date(dueAt).getTime())) continue;

    statements.push(
      db
        .prepare(
          `INSERT INTO reminders (id, user_id, title, due_at, done, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(crypto.randomUUID(), userId, title, dueAt, row.done ? 1 : 0, now, now)
    );
  }
  return statements;
}

export async function importUserData(
  request: Request,
  db: D1Database,
  userId: string
): Promise<Response> {
  const body = (await request
    .json()
    .catch(
      () => ({}) as { subscriptions?: unknown[]; notes?: unknown[]; reminders?: unknown[] }
    )) as {
    subscriptions?: unknown[];
    payments?: unknown[];
    notes?: unknown[];
    reminders?: unknown[];
    schema_version?: number;
  };
  const rows = body.subscriptions ?? [];
  const paymentRows = body.payments ?? [];
  const noteRows = body.notes ?? [];
  const reminderRows = body.reminders ?? [];
  if (
    !Array.isArray(rows) ||
    !Array.isArray(paymentRows) ||
    !Array.isArray(noteRows) ||
    !Array.isArray(reminderRows)
  ) {
    return error('subscriptions/payments/notes/reminders deben ser arrays');
  }
  if (
    rows.length > IMPORT_ROW_LIMIT ||
    paymentRows.length > IMPORT_ROW_LIMIT ||
    noteRows.length > IMPORT_ROW_LIMIT ||
    reminderRows.length > IMPORT_ROW_LIMIT
  ) {
    return error(`Máximo ${IMPORT_ROW_LIMIT} filas por tipo en una importación`, 400);
  }

  const now = new Date().toISOString();
  const noteStatements = buildNoteStatements(db, userId, noteRows, now);
  const reminderStatements = buildReminderStatements(db, userId, reminderRows, now);
  const statements: D1PreparedStatement[] = [...noteStatements, ...reminderStatements];
  const owner = await db
    .prepare(`SELECT timezone FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ timezone: string }>();
  const rejected: { row: number; reason: string }[] = [];
  const subscriptionIdMap = new Map<
    string,
    { id: string; name: string; category: string | null }
  >();
  let importedSubscriptions = 0;
  let importedPayments = 0;

  for (const [index, raw] of rows.entries()) {
    const row = raw as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const amount =
      typeof row.amount === 'number'
        ? row.amount
        : typeof row.amount_minor === 'number'
          ? row.amount_minor / 100
          : parseFloat(String(row.amount));
    const amountMinor = toMinorUnits(amount);
    const frequency = typeof row.frequency === 'string' ? row.frequency : '';
    const currency = typeof row.currency === 'string' ? row.currency : 'MXN';
    if (
      !name ||
      amountMinor == null ||
      !isValidFrequency(frequency) ||
      !isSupportedCurrency(currency)
    ) {
      rejected.push({ row: index + 1, reason: 'nombre, monto, frecuencia o moneda inválidos' });
      continue;
    }

    const id = crypto.randomUUID();
    const sourceId = typeof row.id === 'string' ? row.id : null;
    let rawDueDates: unknown = row.due_dates;
    let rawDueDays: unknown = row.due_days;
    try {
      if (typeof rawDueDates === 'string' && rawDueDates) rawDueDates = JSON.parse(rawDueDates);
      if (typeof rawDueDays === 'string' && rawDueDays) rawDueDays = JSON.parse(rawDueDays);
    } catch {
      rejected.push({ row: index + 1, reason: 'JSON de recurrencia corrupto' });
      continue;
    }

    if (rawDueDates != null && !Array.isArray(rawDueDates)) {
      rejected.push({ row: index + 1, reason: 'due_dates debe ser array' });
      continue;
    }
    if (rawDueDays != null && !Array.isArray(rawDueDays)) {
      rejected.push({ row: index + 1, reason: 'due_days debe ser array' });
      continue;
    }

    const dueDates = parseDueDates({
      due_dates: (rawDueDates ?? null) as { date: string; amount?: number }[] | null,
    });
    if (Array.isArray(rawDueDates) && dueDates.length !== rawDueDates.length) {
      rejected.push({ row: index + 1, reason: 'due_dates contiene fechas o montos inválidos' });
      continue;
    }
    const dueDays = parseDueDaysList({ due_days: (rawDueDays ?? null) as number[] | null });
    if (Array.isArray(rawDueDays) && dueDays.length !== new Set(rawDueDays).size) {
      rejected.push({ row: index + 1, reason: 'due_days contiene valores inválidos' });
      continue;
    }

    const recurrence = normalizeSubscriptionRecurrence(
      {
        frequency,
        due_date: typeof row.due_date === 'string' ? row.due_date : null,
        due_day: typeof row.due_day === 'number' ? row.due_day : undefined,
        due_dates: dueDates,
        due_days: dueDays,
        interval_count: typeof row.interval_count === 'number' ? row.interval_count : null,
        interval_unit: typeof row.interval_unit === 'string' ? row.interval_unit : null,
      },
      new Date(now),
      owner?.timezone ?? NOTIFY_TIMEZONE
    );
    if ('error' in recurrence) {
      rejected.push({ row: index + 1, reason: recurrence.error });
      continue;
    }

    statements.push(
      db
        .prepare(
          `INSERT INTO subscriptions
           (id, user_id, name, amount_minor, currency, due_day, frequency, due_date, due_dates,
            due_days, interval_count, interval_unit, category, notes, notify_days_before,
            notify_hour, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          userId,
          name,
          amountMinor,
          currency,
          recurrence.due_day,
          frequency,
          recurrence.due_date,
          recurrence.due_dates,
          recurrence.due_days,
          frequency === 'interval' && typeof row.interval_count === 'number'
            ? row.interval_count
            : null,
          frequency === 'interval' && typeof row.interval_unit === 'string'
            ? row.interval_unit
            : null,
          typeof row.category === 'string' ? row.category : null,
          typeof row.notes === 'string' ? row.notes : null,
          typeof row.notify_days_before === 'number' ? row.notify_days_before : 1,
          typeof row.notify_hour === 'number' ? row.notify_hour : 9,
          now,
          now
        )
    );
    if (sourceId) {
      subscriptionIdMap.set(sourceId, {
        id,
        name,
        category: typeof row.category === 'string' ? row.category : null,
      });
    }
    importedSubscriptions++;
  }

  for (const [index, raw] of paymentRows.entries()) {
    const row = raw as Record<string, unknown>;
    const amount =
      typeof row.amount === 'number'
        ? row.amount
        : typeof row.amount_minor === 'number'
          ? row.amount_minor / 100
          : Number(row.amount);
    const amountMinor = toMinorUnits(amount);
    const currency = typeof row.currency === 'string' ? row.currency : 'MXN';
    const paidAtRaw = typeof row.paid_at === 'string' ? row.paid_at : '';
    const paidAtDate = new Date(paidAtRaw);
    const fx =
      typeof row.fx_usd_mxn === 'number'
        ? row.fx_usd_mxn
        : typeof row.fx_usd_mxn_micros === 'number'
          ? row.fx_usd_mxn_micros / 1_000_000
          : null;
    const fxMicros = fx == null ? null : toFxMicros(fx);
    const mappedSubscription =
      typeof row.subscription_id === 'string'
        ? subscriptionIdMap.get(row.subscription_id)
        : undefined;
    const name = String(row.name ?? row.subscription_name ?? mappedSubscription?.name ?? '').trim();

    if (
      amountMinor == null ||
      !isSupportedCurrency(currency) ||
      Number.isNaN(paidAtDate.getTime()) ||
      !name ||
      (fx != null && fxMicros == null)
    ) {
      rejected.push({
        row: index + 1,
        reason: 'pago con monto, moneda, fecha, snapshot o FX inválido',
      });
      continue;
    }

    statements.push(
      db
        .prepare(
          `INSERT INTO payment_records
             (id, user_id, subscription_id, amount_minor, currency, paid_at, notes, name,
              category, fx_usd_mxn_micros, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          userId,
          mappedSubscription?.id ?? null,
          amountMinor,
          currency,
          paidAtDate.toISOString(),
          typeof row.notes === 'string' ? row.notes : null,
          name,
          typeof row.category === 'string' ? row.category : (mappedSubscription?.category ?? null),
          currency === 'USD' ? fxMicros : null,
          typeof row.created_at === 'string' && !Number.isNaN(new Date(row.created_at).getTime())
            ? new Date(row.created_at).toISOString()
            : paidAtDate.toISOString()
        )
    );
    importedPayments++;
  }

  if (rejected.length > 0) {
    return json({ error: 'Importación rechazada', rejected }, 400);
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return json({
    ok: true,
    imported: {
      subscriptions: importedSubscriptions,
      payments: importedPayments,
      notes: noteStatements.length,
      reminders: reminderStatements.length,
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
    env.VAPID_PUBLIC_KEY !== 'REPLACE_WITH_VAPID_PUBLIC_KEY' &&
    !!env.VAPID_PRIVATE_KEY;

  return json({
    ok: dbOk,
    service: 'bills-pwa',
    version: env.APP_VERSION,
    db_schema_version: 2,
    maintenance: /^(1|true|on)$/i.test(env.MAINTENANCE_MODE ?? ''),
    db: dbOk,
    push: vapidOk,
    email: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
    time: new Date().toISOString(),
  });
}
