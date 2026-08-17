-- Congela el tipo de cambio USD→MXN al momento de cada pago, en vez de
-- aplicar en vivo el users.fx_usd_mxn actual (que recalcularía el histórico
-- cada vez que el usuario actualiza la tasa en Ajustes). NULL en todo lo
-- existente y en cualquier pago sin tasa configurada — nunca se inventa un
-- valor default. users.fx_usd_mxn (migración 0020) sigue existiendo: es el
-- valor que prellena este campo al registrar un pago nuevo.
ALTER TABLE payment_records ADD COLUMN fx_usd_mxn REAL;
