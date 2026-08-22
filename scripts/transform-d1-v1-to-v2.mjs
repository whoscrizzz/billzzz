#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) args[argv[i]?.replace(/^--/, '')] = argv[i + 1];
  return args;
}

const args = parseArgs(process.argv);
if (!args['source-sql'] || !args.target || !args.report || !args['output-sql']) {
  console.error(
    'Uso: node scripts/transform-d1-v1-to-v2.mjs --source-sql export.sql --target rehearsal.sqlite --report report.json --output-sql import-v2.sql [--as-of RFC3339]'
  );
  process.exit(1);
}

const sourceSqlPath = resolve(args['source-sql']);
const targetPath = resolve(args.target);
const reportPath = resolve(args.report);
const outputSqlPath = resolve(args['output-sql']);
const asOf = new Date(args['as-of'] ?? new Date().toISOString());
if (Number.isNaN(asOf.getTime())) throw new Error('--as-of debe ser RFC3339 válido');
if (existsSync(targetPath)) throw new Error(`El target ya existe: ${targetPath}`);

const baseline = readFileSync(
  new URL('../migrations/0001_v2_baseline.sql', import.meta.url),
  'utf8'
);
const source = new DatabaseSync(':memory:');
source.exec('PRAGMA foreign_keys = OFF');
source.exec(readFileSync(sourceSqlPath, 'utf8'));

const target = new DatabaseSync(targetPath);
target.exec('PRAGMA foreign_keys = ON');
target.exec(baseline);

const report = {
  schema_version: 2,
  generated_at: new Date().toISOString(),
  as_of: asOf.toISOString(),
  source_rows: {},
  imported_rows: {},
  rejected: [],
  reconciliation: {},
};
const importStatements = ['PRAGMA foreign_keys = ON;', 'BEGIN TRANSACTION;'];

function tableExists(db, table) {
  return Boolean(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table)
  );
}

function rows(table) {
  if (!tableExists(source, table)) return [];
  const result = source.prepare(`SELECT * FROM "${table}"`).all();
  report.source_rows[table] = result.length;
  return result;
}

function fingerprint(table, row) {
  const raw = String(row.id ?? row.token ?? row.key ?? row.credential_id ?? 'missing');
  return createHash('sha256').update(`${table}:${raw}`).digest('hex').slice(0, 12);
}

function reject(table, row, reason) {
  report.rejected.push({ table, row_ref: fingerprint(table, row), reason });
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insert(table, values) {
  const entries = Object.entries(values);
  const columns = entries.map(([key]) => `"${key}"`).join(', ');
  const placeholders = entries.map(() => '?').join(', ');
  target
    .prepare(`INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`)
    .run(...entries.map(([, value]) => value));
  importStatements.push(
    `INSERT INTO "${table}" (${columns}) VALUES (${entries.map(([, value]) => sqlLiteral(value)).join(', ')});`
  );
  report.imported_rows[table] = (report.imported_rows[table] ?? 0) + 1;
}

function instant(value, fallback = null) {
  if (value == null || value === '') return fallback;
  let raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
    raw = `${raw.replace(' ', 'T')}Z`;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : null;
}

function safeCalendarDate(year, monthIndex, day) {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, last))).toISOString().slice(0, 10);
}

function nextDueDate(row, dueDates) {
  const existing = row.due_date == null ? null : calendarDate(String(row.due_date));
  if (row.due_date != null && !existing) throw new Error('due_date imposible');
  if (dueDates.length > 0) {
    const today = asOf.toISOString().slice(0, 10);
    return dueDates.find((entry) => entry.date >= today)?.date ?? dueDates.at(-1).date;
  }
  if (existing) return existing;
  if (row.frequency === 'once' || row.frequency === 'interval') {
    throw new Error('frecuencia sin due_date materializable');
  }
  const dueDay = Number(row.due_day);
  const y = asOf.getUTCFullYear();
  const m = asOf.getUTCMonth();
  const today = asOf.toISOString().slice(0, 10);
  if (row.frequency === 'weekly') {
    const current = asOf.getUTCDay() || 7;
    const delta = (dueDay - current + 7) % 7;
    return new Date(Date.UTC(y, m, asOf.getUTCDate() + delta)).toISOString().slice(0, 10);
  }
  if (row.frequency === 'yearly') {
    const created = instant(row.created_at, asOf.toISOString());
    const month = new Date(created).getUTCMonth();
    let candidate = safeCalendarDate(y, month, dueDay);
    if (candidate < today) candidate = safeCalendarDate(y + 1, month, dueDay);
    return candidate;
  }
  let candidate = safeCalendarDate(y, m, dueDay);
  if (candidate < today) candidate = safeCalendarDate(y, m + 1, dueDay);
  return candidate;
}

function minor(value) {
  const n = Number(value);
  const result = Math.round(n * 100);
  if (!Number.isFinite(n) || !Number.isSafeInteger(result) || result < 0) return null;
  return result;
}

function micros(value) {
  if (value == null) return null;
  const result = Math.round(Number(value) * 1_000_000);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

function dueDatesJson(value) {
  if (value == null || value === '') return [];
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error('due_dates contiene JSON corrupto');
  }
  if (!Array.isArray(parsed)) throw new Error('due_dates no es array');
  const map = new Map();
  for (const item of parsed) {
    const date = calendarDate(typeof item === 'string' ? item : item?.date);
    if (!date) throw new Error('due_dates contiene fecha imposible');
    const amountMinor =
      typeof item === 'object' && item !== null
        ? item.amount_minor ?? (item.amount == null ? undefined : minor(item.amount))
        : undefined;
    if (amountMinor !== undefined && (!Number.isSafeInteger(amountMinor) || amountMinor < 0)) {
      throw new Error('due_dates contiene monto inválido');
    }
    map.set(date, amountMinor === undefined ? { date } : { date, amount_minor: amountMinor });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function jsonArray(value, validator) {
  if (value == null || value === '') return null;
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error('JSON corrupto');
  }
  if (!Array.isArray(parsed) || !parsed.every(validator)) throw new Error('array JSON inválido');
  return JSON.stringify([...new Set(parsed)].sort((a, b) => a - b));
}

function stableUuid(seed) {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

const userIds = new Set();
const subscriptionRows = new Map();
const subscriptionIds = new Set();
const paymentIds = new Set();

target.exec('BEGIN IMMEDIATE');
try {
  for (const row of rows('users')) {
    try {
      if (!row.id) throw new Error('id nulo');
      const budget = row.budget_limit == null ? null : minor(row.budget_limit);
      if (row.budget_limit != null && budget == null) throw new Error('budget_limit inválido');
      const fx = micros(row.fx_usd_mxn);
      if (row.fx_usd_mxn != null && fx == null) throw new Error('fx_usd_mxn inválido');
      insert('users', {
        id: row.id,
        email: row.email ?? null,
        display_name: row.display_name ?? null,
        budget_limit_minor: budget,
        email_reminders: row.email_reminders ? 1 : 0,
        timezone: row.timezone || 'America/Mexico_City',
        action_token_version: Number(row.action_token_version ?? 0),
        calendar_token: row.calendar_token ?? null,
        capture_token: row.capture_token ?? null,
        disabled: row.disabled ? 1 : 0,
        fx_usd_mxn_micros: fx,
        created_at: instant(row.created_at, asOf.toISOString()),
      });
      userIds.add(row.id);
    } catch (error) {
      reject('users', row, error.message);
    }
  }

  for (const row of rows('subscriptions')) {
    try {
      if (!row.id || !userIds.has(row.user_id)) throw new Error('id o user_id inválido');
      const amountMinor = minor(row.amount);
      if (amountMinor == null) throw new Error('amount inválido');
      const currency = String(row.currency ?? 'MXN').toUpperCase();
      if (!['MXN', 'USD'].includes(currency)) throw new Error('currency no soportada');
      if (!['weekly', 'monthly', 'yearly', 'once', 'interval'].includes(row.frequency)) {
        throw new Error('frequency inválida');
      }
      const dueDay = Number(row.due_day);
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new Error('due_day inválido');
      const dueDates = dueDatesJson(row.due_dates);
      const dueDate = nextDueDate(row, dueDates);
      const dueDays = jsonArray(row.due_days, (value) => Number.isInteger(value) && value >= 1 && value <= 31);
      const intervalCount = row.frequency === 'interval' ? Number(row.interval_count) : null;
      const intervalUnit = row.frequency === 'interval' ? row.interval_unit : null;
      if (
        row.frequency === 'interval' &&
        (!Number.isInteger(intervalCount) || intervalCount < 1 || !['day', 'week', 'month'].includes(intervalUnit))
      ) {
        throw new Error('interval incompleto');
      }
      const trashedAt = instant(row.trashed_at);
      const deletedAt = trashedAt ? null : instant(row.deleted_at);
      insert('subscriptions', {
        id: row.id,
        user_id: row.user_id,
        name: String(row.name ?? '').trim(),
        amount_minor: amountMinor,
        currency,
        due_day: Number(dueDate.slice(8, 10)) || dueDay,
        frequency: row.frequency,
        due_date: dueDate,
        due_dates: dueDates.length ? JSON.stringify(dueDates) : null,
        due_days: dueDays,
        interval_count: intervalCount,
        interval_unit: intervalUnit,
        category: row.category ?? null,
        notes: row.notes ?? null,
        notify_days_before: Number(row.notify_days_before ?? 1),
        notify_hour: Number(row.notify_hour ?? 9),
        snoozed_until: row.snoozed_until == null ? null : calendarDate(String(row.snoozed_until)),
        last_paid_at: instant(row.last_paid_at),
        deleted_at: deletedAt,
        trashed_at: trashedAt,
        created_at: instant(row.created_at, asOf.toISOString()),
        updated_at: instant(row.updated_at, asOf.toISOString()),
      });
      subscriptionIds.add(row.id);
      subscriptionRows.set(row.id, row);
    } catch (error) {
      reject('subscriptions', row, error.message);
    }
  }

  for (const row of rows('payment_records')) {
    try {
      if (!row.id || !userIds.has(row.user_id)) throw new Error('id o user_id inválido');
      const amountMinor = minor(row.amount);
      if (amountMinor == null) throw new Error('amount inválido');
      const currency = String(row.currency ?? 'MXN').toUpperCase();
      if (!['MXN', 'USD'].includes(currency)) throw new Error('currency no soportada');
      const sourceSub = row.subscription_id ? subscriptionRows.get(row.subscription_id) : null;
      const name = String(row.name ?? sourceSub?.name ?? '').trim();
      if (!name) throw new Error('snapshot de nombre no recuperable');
      const paidAt = instant(row.paid_at);
      if (!paidAt) throw new Error('paid_at inválido');
      const fx = micros(row.fx_usd_mxn);
      if (row.fx_usd_mxn != null && fx == null) throw new Error('fx inválido');
      insert('payment_records', {
        id: row.id,
        user_id: row.user_id,
        subscription_id: subscriptionIds.has(row.subscription_id) ? row.subscription_id : null,
        amount_minor: amountMinor,
        currency,
        paid_at: paidAt,
        notes: row.notes ?? null,
        name,
        category: row.category ?? sourceSub?.category ?? null,
        fx_usd_mxn_micros: currency === 'USD' ? fx : null,
        created_at: instant(row.created_at, paidAt),
      });
      paymentIds.add(row.id);
    } catch (error) {
      reject('payment_records', row, error.message);
    }
  }

  const copy = (sourceTable, targetTable, map) => {
    for (const row of rows(sourceTable)) {
      try {
        const mapped = map(row);
        if (mapped) insert(targetTable, mapped);
      } catch (error) {
        reject(sourceTable, row, error.message);
      }
    }
  };

  copy('push_subscriptions', 'push_subscriptions', (row) => {
    if (!row.id || !userIds.has(row.user_id)) throw new Error('relación inválida');
    return { ...row, created_at: instant(row.created_at, asOf.toISOString()) };
  });
  copy('magic_links', 'magic_links', (row) => {
    const expires = instant(row.expires_at);
    if (!expires || row.used_at || new Date(expires) <= asOf) return null;
    return { token: row.token, email: row.email, short_code: row.short_code ?? null, expires_at: expires, used_at: null };
  });
  copy('sessions', 'sessions', (row) => {
    const expires = instant(row.expires_at);
    if (!expires || new Date(expires) <= asOf || !userIds.has(row.user_id)) return null;
    return {
      token: row.token,
      id: row.id || stableUuid(`session:${row.token}`),
      user_id: row.user_id,
      expires_at: expires,
      created_at: instant(row.created_at, asOf.toISOString()),
      user_agent: row.user_agent ?? null,
      ip: row.ip ?? null,
      device_name: row.device_name ?? null,
    };
  });
  copy('auth_rate_limits', 'auth_rate_limits', (row) => {
    const start = instant(row.window_start);
    if (!start || new Date(start).getTime() < asOf.getTime() - 3_600_000) return null;
    return { key: row.key, attempts: Number(row.attempts), window_start: start };
  });
  copy('passkey_credentials', 'passkey_credentials', (row) => {
    if (!row.id || !userIds.has(row.user_id)) throw new Error('relación inválida');
    return {
      ...row,
      transports: row.transports ?? null,
      backed_up: row.backed_up ? 1 : 0,
      created_at: instant(row.created_at, asOf.toISOString()),
      last_used_at: instant(row.last_used_at),
    };
  });
  copy('webauthn_challenges', 'webauthn_challenges', (row) => {
    const expires = instant(row.expires_at);
    if (!expires || new Date(expires) <= asOf) return null;
    if (row.user_id && !userIds.has(row.user_id)) throw new Error('user_id huérfano');
    return { ...row, expires_at: expires };
  });

  const cutoff30 = asOf.getTime() - 30 * 86_400_000;
  const cutoff90 = asOf.getTime() - 90 * 86_400_000;
  copy('notification_log', 'subscription_notification_claims', (row) => {
    const sent = instant(row.sent_at, asOf.toISOString());
    if (new Date(sent).getTime() < cutoff90) return null;
    if (String(row.notification_key).startsWith('email:')) {
      if (!userIds.has(row.user_id)) throw new Error('user_id huérfano');
      insert('email_digest_claims', {
        id: row.id,
        user_id: row.user_id,
        digest_key: row.notification_key,
        sent_at: sent,
      });
      return null;
    }
    if (!userIds.has(row.user_id) || !subscriptionIds.has(row.subscription_id)) {
      throw new Error('relación huérfana');
    }
    return { id: row.id, user_id: row.user_id, subscription_id: row.subscription_id, notification_key: row.notification_key, sent_at: sent };
  });
  copy('notification_attempts', 'notification_attempts', (row) => {
    const created = instant(row.created_at, asOf.toISOString());
    if (new Date(created).getTime() < cutoff30) return null;
    if (!userIds.has(row.user_id) || !subscriptionIds.has(row.subscription_id)) throw new Error('relación huérfana');
    return { ...row, created_at: created };
  });
  copy('notification_actions', 'notification_actions', (row) => {
    const created = instant(row.created_at, asOf.toISOString());
    if (new Date(created).getTime() < cutoff30) return null;
    if (!userIds.has(row.user_id) || !subscriptionIds.has(row.subscription_id)) throw new Error('relación huérfana');
    JSON.parse(row.prev_snapshot);
    return {
      ...row,
      result_payment_id: paymentIds.has(row.result_payment_id) ? row.result_payment_id : null,
      post_action_updated_at: instant(row.post_action_updated_at),
      undone_at: instant(row.undone_at),
      created_at: created,
    };
  });
  copy('notes', 'notes', (row) => {
    if (!row.id || !userIds.has(row.user_id)) throw new Error('relación inválida');
    return { ...row, trashed_at: instant(row.trashed_at), created_at: instant(row.created_at, asOf.toISOString()), updated_at: instant(row.updated_at, asOf.toISOString()) };
  });
  copy('reminders', 'reminders', (row) => {
    if (!row.id || !userIds.has(row.user_id)) throw new Error('relación inválida');
    return { ...row, done: row.done ? 1 : 0, due_at: instant(row.due_at), notified_at: instant(row.notified_at), trashed_at: instant(row.trashed_at), created_at: instant(row.created_at, asOf.toISOString()), updated_at: instant(row.updated_at, asOf.toISOString()) };
  });

  const fkViolations = target.prepare('PRAGMA foreign_key_check').all();
  const integrity = target.prepare('PRAGMA integrity_check').get().integrity_check;
  const moneyByCurrency = (inputRows, field) =>
    Object.fromEntries(
      [...inputRows.reduce((totals, row) => {
        const currency = String(row.currency ?? 'MXN').toUpperCase();
        totals.set(currency, (totals.get(currency) ?? 0) + (minor(row[field]) ?? 0));
        return totals;
      }, new Map())].sort(([a], [b]) => a.localeCompare(b))
    );
  const targetMoneyByCurrency = (table) =>
    Object.fromEntries(
      target
        .prepare(`SELECT currency, COALESCE(SUM(amount_minor), 0) AS total FROM ${table} GROUP BY currency ORDER BY currency`)
        .all()
        .map((row) => [row.currency, row.total])
    );
  const sourceSubscriptions = rows('subscriptions');
  const sourcePayments = rows('payment_records');
  report.reconciliation = {
    integrity_check: integrity,
    foreign_key_violations: fkViolations.length,
    v1_subscription_minor_total: sourceSubscriptions.reduce((sum, row) => sum + (minor(row.amount) ?? 0), 0),
    v2_subscription_minor_total: target.prepare('SELECT COALESCE(SUM(amount_minor), 0) AS total FROM subscriptions').get().total,
    v1_payment_minor_total: sourcePayments.reduce((sum, row) => sum + (minor(row.amount) ?? 0), 0),
    v2_payment_minor_total: target.prepare('SELECT COALESCE(SUM(amount_minor), 0) AS total FROM payment_records').get().total,
    v1_subscriptions_by_currency: moneyByCurrency(sourceSubscriptions, 'amount'),
    v2_subscriptions_by_currency: targetMoneyByCurrency('subscriptions'),
    v1_payments_by_currency: moneyByCurrency(sourcePayments, 'amount'),
    v2_payments_by_currency: targetMoneyByCurrency('payment_records'),
    strict_tables: target
      .prepare(`SELECT COUNT(*) AS n FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%' AND strict = 1`)
      .get().n,
  };

  if (report.rejected.length || integrity !== 'ok' || fkViolations.length) {
    target.exec('ROLLBACK');
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.error(`Transformación bloqueada: ${report.rejected.length} rechazo(s). Ver ${reportPath}`);
    process.exitCode = 2;
  } else {
    target.exec('COMMIT');
    target.exec('PRAGMA optimize');
    importStatements.push('COMMIT;', 'PRAGMA optimize;', '');
    writeFileSync(outputSqlPath, importStatements.join('\n'), { mode: 0o600 });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(`Transformación validada: ${targetPath}`);
    console.log(`Import D1 v2: ${outputSqlPath}`);
    console.log(`Reporte sin PII: ${reportPath}`);
  }
} catch (error) {
  try {
    target.exec('ROLLBACK');
  } catch {
    // La transacción ya pudo cerrarse por un error fatal de SQLite.
  }
  report.rejected.push({ table: 'transform', row_ref: 'fatal', reason: error.message });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  throw error;
} finally {
  source.close();
  target.close();
}
