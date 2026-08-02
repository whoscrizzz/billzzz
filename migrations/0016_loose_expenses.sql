-- Fase 7b — gastos sueltos (capturados sin abrir la app) + token de captura.
--
-- Hasta ahora todo payment_record colgaba de una suscripción
-- (subscription_id NOT NULL). Un gasto suelto como «320 de comida» no es un
-- bill recurrente y no tiene a qué colgarse, así que subscription_id pasa a
-- ser nulable y la fila gana su propio name/category.
--
-- SQLite no permite quitar un NOT NULL con ALTER TABLE — hay que reconstruir
-- la tabla. Mismo patrón que 0005_payments_once.sql usó para subscriptions:
-- crear _new, copiar, DROP, RENAME, recrear índices.

CREATE TABLE payment_records_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  -- Nulable desde 0016: NULL = gasto suelto, sin suscripción asociada.
  subscription_id TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  paid_at TEXT NOT NULL,
  notes TEXT,
  -- Solo se llenan en gastos sueltos; en un pago de suscripción quedan NULL
  -- y el nombre/categoría se leen de la suscripción vía JOIN, como siempre.
  name TEXT,
  category TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO payment_records_new (
  id, user_id, subscription_id, amount, currency, paid_at, notes, created_at
)
SELECT
  id, user_id, subscription_id, amount, currency, paid_at, notes, created_at
FROM payment_records;

DROP TABLE payment_records;
ALTER TABLE payment_records_new RENAME TO payment_records;

CREATE INDEX IF NOT EXISTS idx_payment_records_sub ON payment_records(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_user ON payment_records(user_id);

-- Token opaco por usuario para el endpoint de captura, mismo rol que
-- users.calendar_token (ver worker/src/calendar.ts).
ALTER TABLE users ADD COLUMN capture_token TEXT;
