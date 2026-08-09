import type { ReminderRow } from './env';
import { error, json } from './env';

const MAX_TITLE_LEN = 200;

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

export async function listReminders(db: D1Database, userId: string): Promise<Response> {
  const { results } = await db
    .prepare(`SELECT * FROM reminders WHERE user_id = ? ORDER BY due_at ASC`)
    .bind(userId)
    .all<ReminderRow>();

  return json({ reminders: results ?? [] });
}

export async function createReminder(
  request: Request,
  db: D1Database,
  userId: string
): Promise<Response> {
  const body = (await request.json()) as Partial<ReminderRow>;
  if (!body.title || body.title.trim().length === 0 || body.title.length > MAX_TITLE_LEN) {
    return error(`title es requerido y debe tener ${MAX_TITLE_LEN} caracteres o menos`);
  }
  if (!body.due_at || !isValidIsoDate(body.due_at)) {
    return error('due_at debe ser una fecha ISO válida');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO reminders (id, user_id, title, due_at, done, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    )
    .bind(id, userId, body.title, body.due_at, now, now)
    .run();

  return json({ id }, 201);
}

export async function updateReminder(
  request: Request,
  db: D1Database,
  userId: string,
  id: string
): Promise<Response> {
  const body = (await request.json()) as Partial<ReminderRow> & { done?: boolean | number };
  if (body.title != null && (body.title.trim().length === 0 || body.title.length > MAX_TITLE_LEN)) {
    return error(`title debe tener entre 1 y ${MAX_TITLE_LEN} caracteres`);
  }
  if (body.due_at != null && !isValidIsoDate(body.due_at)) {
    return error('due_at debe ser una fecha ISO válida');
  }

  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  const assign = (column: string, value: string | number | null | undefined) => {
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      binds.push(value);
    }
  };

  assign('title', body.title);
  if (body.due_at !== undefined) {
    // Un recordatorio reprogramado vuelve a ser elegible para notificarse.
    assign('due_at', body.due_at);
    assign('notified_at', null);
  }
  if (body.done !== undefined) {
    assign('done', body.done ? 1 : 0);
  }

  if (sets.length === 0) return error('No fields to update');

  sets.push('updated_at = ?');
  binds.push(new Date().toISOString());
  binds.push(id, userId);

  const result = await db
    .prepare(`UPDATE reminders SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...binds)
    .run();

  if (result.meta.changes === 0) return error('Reminder not found', 404);

  return json({ ok: true });
}

export async function deleteReminder(
  db: D1Database,
  userId: string,
  id: string
): Promise<Response> {
  const result = await db
    .prepare(`DELETE FROM reminders WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();

  if (result.meta.changes === 0) return error('Reminder not found', 404);

  return json({ ok: true });
}
