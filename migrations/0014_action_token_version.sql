-- Fase 6a: permite invalidar en bloque los tokens de acción de notificaciones
-- (mark-paid/snooze/undo desde el Service Worker) cuando el usuario cierra
-- sesión en otros dispositivos. No tiene relación con `sessions`/JWT.
ALTER TABLE users ADD COLUMN action_token_version INTEGER NOT NULL DEFAULT 0;
