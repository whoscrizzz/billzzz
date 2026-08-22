-- Fase 3 del rediseño: recurrencia por intervalo (cada N días/semanas/meses)
-- y varios días fijos del mes (quincenal, bimestral) sin emular con due_dates.
-- Opt-in: columnas nuevas, NULL en todos los registros existentes.
ALTER TABLE subscriptions ADD COLUMN interval_count INTEGER;
ALTER TABLE subscriptions ADD COLUMN interval_unit TEXT;
ALTER TABLE subscriptions ADD COLUMN due_days TEXT;
