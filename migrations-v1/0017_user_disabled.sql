-- Revocación no destructiva: marca una cuenta como inhabilitada sin borrar sus datos.
-- Antes, quitarle el acceso a alguien obligaba a borrar su fila de `users`, lo que a su vez
-- exigía vaciar todas las tablas hijas con FOREIGN KEY (sessions, subscriptions,
-- payment_records, push_subscriptions, passkey_credentials) — es decir, perder su historial.
-- Aditiva y con DEFAULT 0, así que toda fila existente sigue activa.
ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;
