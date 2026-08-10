import type { NoteRow } from './env';
import { error, isUniqueConstraintError, isValidUuid, json } from './env';

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 20000;
const MAX_CATEGORY_LEN = 120;

function validateNoteFields(body: {
  title?: string;
  body?: string;
  category?: string | null;
}): string | null {
  if (body.title != null && (body.title.trim().length === 0 || body.title.length > MAX_TITLE_LEN)) {
    return `El título debe tener entre 1 y ${MAX_TITLE_LEN} caracteres`;
  }
  if (body.body != null && body.body.length > MAX_BODY_LEN) {
    return `La nota debe tener ${MAX_BODY_LEN} caracteres o menos`;
  }
  if (body.category != null && body.category.length > MAX_CATEGORY_LEN) {
    return `La categoría debe tener ${MAX_CATEGORY_LEN} caracteres o menos`;
  }
  return null;
}

export async function listNotes(db: D1Database, userId: string): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT * FROM notes WHERE user_id = ? AND trashed_at IS NULL ORDER BY updated_at DESC`
    )
    .bind(userId)
    .all<NoteRow>();

  return json({ notes: results ?? [] });
}

export async function createNote(
  request: Request,
  db: D1Database,
  userId: string
): Promise<Response> {
  const body = (await request.json()) as Partial<NoteRow> & { id?: string };
  if (!body.title) return error('title es requerido');

  const fieldError = validateNoteFields(body);
  if (fieldError) return error(fieldError);

  // Id generado por el cliente (offline queue / retry) para que el create
  // sea idempotente — ver el catch de abajo.
  const id = isValidUuid(body.id) ? body.id : crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await db
      .prepare(
        `INSERT INTO notes (id, user_id, title, body, category, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, userId, body.title, body.body ?? '', body.category ?? null, now, now)
      .run();
  } catch (err) {
    // El id ya existe — un retry de red o una reconexión disparó el mismo
    // create dos veces. Dedup-is-a-claim vía la PRIMARY KEY, mismo
    // principio que notification_log: si la fila es del mismo usuario, el
    // create ya se aplicó antes, así que responde éxito en vez de duplicar.
    if (isUniqueConstraintError(err)) {
      const existing = await db
        .prepare(`SELECT id FROM notes WHERE id = ? AND user_id = ?`)
        .bind(id, userId)
        .first<{ id: string }>();
      if (existing) return json({ id: existing.id }, 200);
    }
    throw err;
  }

  return json({ id }, 201);
}

export async function updateNote(
  request: Request,
  db: D1Database,
  userId: string,
  id: string
): Promise<Response> {
  const body = (await request.json()) as Partial<NoteRow>;
  const fieldError = validateNoteFields(body);
  if (fieldError) return error(fieldError);

  const sets: string[] = [];
  const binds: (string | null)[] = [];
  const assign = (column: string, value: string | null | undefined) => {
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      binds.push(value);
    }
  };

  assign('title', body.title);
  assign('body', body.body);
  assign('category', body.category);

  if (sets.length === 0) return error('No hay campos para actualizar');

  sets.push('updated_at = ?');
  binds.push(new Date().toISOString());
  binds.push(id, userId);

  const result = await db
    .prepare(
      `UPDATE notes SET ${sets.join(', ')} WHERE id = ? AND user_id = ? AND trashed_at IS NULL`
    )
    .bind(...binds)
    .run();

  if (result.meta.changes === 0) return error('Nota no encontrada', 404);

  return json({ ok: true });
}

export async function deleteNote(db: D1Database, userId: string, id: string): Promise<Response> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE notes SET trashed_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND trashed_at IS NULL`
    )
    .bind(now, now, id, userId)
    .run();

  if (result.meta.changes === 0) return error('Nota no encontrada', 404);

  return json({ ok: true });
}

export async function listTrashedNotes(db: D1Database, userId: string): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT * FROM notes
       WHERE user_id = ? AND trashed_at IS NOT NULL
       ORDER BY trashed_at DESC
       LIMIT 50`
    )
    .bind(userId)
    .all<NoteRow>();

  return json({ notes: results ?? [] });
}

export async function restoreTrashedNote(
  db: D1Database,
  userId: string,
  id: string
): Promise<Response> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE notes SET trashed_at = NULL, updated_at = ?
       WHERE id = ? AND user_id = ? AND trashed_at IS NOT NULL`
    )
    .bind(now, id, userId)
    .run();

  if (result.meta.changes === 0) {
    return error('Nota en la papelera no encontrada', 404);
  }

  const note = await db
    .prepare(`SELECT * FROM notes WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<NoteRow>();

  return json({ ok: true, note });
}
