// Doble de D1 para las rutas de revocación de sesiones (worker/src/auth.ts).
//
// Interpreta el WHERE que el módulo realmente emite en vez de replicar el
// filtro: si alguien quita el `AND user_id = ?` del DELETE, el doble borra de
// más y el test falla. Un fake que filtrara por su cuenta volvería a ser la
// reimplementación que estos tests tenían antes.
//
// Cubre solo las dos formas que auth.ts usa aquí:
//   DELETE FROM sessions WHERE <col> = ? [AND <col> != ?] …
//   UPDATE users SET action_token_version = action_token_version + 1 WHERE id = ?

/** Traduce `col = ?` / `col != ?` unidos por AND en un predicado sobre la fila. */
function compileWhere(sql, args) {
  const where = sql.split(/\bWHERE\b/i)[1];
  if (!where) throw new Error(`fake-sessions-db: sin WHERE en: ${sql}`);

  let argIndex = 0;
  const clauses = where.split(/\bAND\b/i).map((raw) => {
    const m = raw.trim().match(/^(\w+)\s*(!=|=)\s*\?$/);
    if (!m) throw new Error(`fake-sessions-db: cláusula no soportada: "${raw.trim()}"`);
    const [, column, op] = m;
    const expected = args[argIndex++];
    return (row) => (op === '=' ? row[column] === expected : row[column] !== expected);
  });

  return (row) => clauses.every((fn) => fn(row));
}

/**
 * `sessions`: filas `{ id, token, user_id }`.
 * Expone el estado resultante para que el test afirme qué sobrevivió.
 */
export function fakeSessionsDb(sessions = []) {
  const db = {
    sessions: [...sessions],
    actionTokenVersion: 0,
    executed: [],

    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) {
          stmt.args = args;
          return stmt;
        },
        async run() {
          return db._exec(sql, stmt.args);
        },
        _run() {
          return db._exec(sql, stmt.args);
        },
      };
      return stmt;
    },

    async batch(statements) {
      return Promise.all(statements.map((s) => s._run()));
    },

    _exec(sql, args) {
      db.executed.push({ sql, args });

      if (/^\s*DELETE FROM sessions/i.test(sql)) {
        const matches = compileWhere(sql, args);
        const before = db.sessions.length;
        db.sessions = db.sessions.filter((row) => !matches(row));
        return { meta: { changes: before - db.sessions.length } };
      }

      if (/^\s*UPDATE users SET action_token_version/i.test(sql)) {
        db.actionTokenVersion += 1;
        return { meta: { changes: 1 } };
      }

      throw new Error(`fake-sessions-db: sentencia no soportada: ${sql}`);
    },
  };

  return db;
}
