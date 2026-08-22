-- Papelera con purga automática a 30 días. Columna separada de `deleted_at`,
-- que sigue siendo exclusiva del archivo automático al pagar una suscripción
-- "once"/terminada (ver markSubscriptionPaid) — no tocar ese flujo.
-- Opt-in: columna nueva, NULL en todos los registros existentes.
ALTER TABLE subscriptions ADD COLUMN trashed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_subscriptions_trashed ON subscriptions(trashed_at);
