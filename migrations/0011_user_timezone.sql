-- Per-user notify timezone. Defaults to the app's original fixed zone so
-- existing users keep today's behavior (notify_hour evaluated in Mexico
-- City) unless they explicitly pick a different one in Ajustes.
ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Mexico_City';
