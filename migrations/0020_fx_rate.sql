-- Tipo de cambio USD→MXN manual del usuario, para mostrar un total
-- aproximado en pesos junto a los totales por moneda (SpendingOverview).
-- NULL en todo lo existente: sin valor, no se muestra conversión — nunca se
-- inventa un tipo de cambio por default.
ALTER TABLE users ADD COLUMN fx_usd_mxn REAL;
