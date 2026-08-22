-- Fase 6a: registro de acciones tomadas desde una notificación (mark-paid/
-- snooze disparados por el Service Worker vía token de acción firmado).
-- `id` = notificationKey (`subId:nextDue:daysLeft`) — el propio INSERT es el
-- claim de idempotencia, igual que `notification_log` para el envío. No es
-- la misma tabla: esta vive mientras la acción pueda deshacerse, no se borra
-- si falla un intento de entrega.
CREATE TABLE IF NOT EXISTS notification_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  action TEXT NOT NULL,
  result_payment_id TEXT,
  prev_snapshot TEXT NOT NULL,
  post_action_updated_at TEXT NOT NULL,
  undone_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notification_actions_user ON notification_actions(user_id, created_at);
