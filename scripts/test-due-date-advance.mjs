// Cobertura de regresión para advanceDueDateAfterPayment (worker y cliente):
// hasta ahora ningún test llamaba esta función sobre una suscripción mensual
// y verificaba que due_day/due_date cayeran en el día esperado tras marcar
// pagado — el hueco que dejó pasar el bug de "las fechas mensuales no
// respetan el día configurado" sin que ningún test lo notara.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const worker = await loadTsModule('worker/src/due-dates.ts');
const client = await loadTsModule('src/lib/due-dates.ts');

function baseSub(overrides = {}) {
  return {
    frequency: 'monthly',
    due_day: 1,
    due_date: null,
    due_dates: null,
    due_days: null,
    interval_count: null,
    interval_unit: null,
    created_at: '2025-01-01T00:00:00.000Z',
    snoozed_until: null,
    ...overrides,
  };
}

// Mediodía UTC: suficiente margen para que "qué día es hoy" coincida entre
// la zona IANA que usa el worker y la hora local de la máquina que corre el
// test para el cliente, sin acercarse a un cruce de medianoche.
const noonUtc = (iso) => new Date(`${iso}T12:00:00Z`);

test('mensual: due_day se preserva tras pagar (el bug reportado)', () => {
  const sub = baseSub({ due_day: 15, due_date: '2026-08-15' });
  const from = noonUtc('2026-08-15');

  const workerResult = worker.advanceDueDateAfterPayment(sub, from);
  const clientResult = client.advanceDueDateAfterPayment(sub, from);

  assert.deepEqual(workerResult, { due_date: '2026-09-15', due_day: 15, due_dates: null });
  assert.deepEqual(clientResult, workerResult);
});

test('mensual: due_day 31 se preserva como ancla aunque el mes se recorte', () => {
  const sub = baseSub({ due_day: 31, due_date: '2026-01-31' });
  const from = noonUtc('2026-01-31');

  const workerResult = worker.advanceDueDateAfterPayment(sub, from);
  const clientResult = client.advanceDueDateAfterPayment(sub, from);

  // Febrero 2026 no es bisiesto: la fecha real se recorta al día 28, pero el
  // ancla due_day se mantiene en 31 para que marzo vuelva a caer en el 31.
  assert.deepEqual(workerResult, { due_date: '2026-02-28', due_day: 31, due_dates: null });
  assert.deepEqual(clientResult, workerResult);
});

test('semanal: due_day (día ISO de la semana) se preserva tras pagar', () => {
  const anchor = '2026-08-12';
  const dow = new Date(`${anchor}T00:00:00Z`).getUTCDay();
  const due_day = dow === 0 ? 7 : dow;
  const sub = baseSub({ frequency: 'weekly', due_day, due_date: anchor });
  const from = noonUtc(anchor);

  const workerResult = worker.advanceDueDateAfterPayment(sub, from);
  const clientResult = client.advanceDueDateAfterPayment(sub, from);

  assert.deepEqual(workerResult, { due_date: '2026-08-19', due_day, due_dates: null });
  assert.deepEqual(clientResult, workerResult);
});

test('anual: due_day y mes se preservan tras pagar', () => {
  const sub = baseSub({ frequency: 'yearly', due_day: 15, due_date: '2026-08-15' });
  const from = noonUtc('2026-08-15');

  const workerResult = worker.advanceDueDateAfterPayment(sub, from);
  const clientResult = client.advanceDueDateAfterPayment(sub, from);

  assert.deepEqual(workerResult, { due_date: '2027-08-15', due_day: 15, due_dates: null });
  assert.deepEqual(clientResult, workerResult);
});

test('interval: avanza exactamente interval_count unidades desde el ancla', () => {
  const sub = baseSub({
    frequency: 'interval',
    due_date: '2026-08-01',
    interval_count: 10,
    interval_unit: 'day',
  });
  const from = noonUtc('2026-08-01');

  const workerResult = worker.advanceDueDateAfterPayment(sub, from);
  const clientResult = client.advanceDueDateAfterPayment(sub, from);

  assert.deepEqual(workerResult, { due_date: '2026-08-11', due_day: 11, due_dates: null });
  assert.deepEqual(clientResult, workerResult);
});

test('due_days (días fijos del mes) tiene prioridad sobre due_day y avanza al siguiente día fijo', () => {
  const sub = baseSub({ due_day: 1, due_date: null, due_days: JSON.stringify([1, 15]) });
  const from = noonUtc('2026-08-01');

  const workerResult = worker.advanceDueDateAfterPayment(sub, from);
  const clientResult = client.advanceDueDateAfterPayment(sub, from);

  // La columna due_days (plural) no se toca en el patch: es un patrón fijo,
  // no una lista que se consume — solo due_date/due_day avanzan.
  assert.deepEqual(workerResult, { due_date: '2026-08-15', due_day: 15, due_dates: null });
  assert.deepEqual(clientResult, workerResult);
});

test('due_dates (lista explícita) consume la fecha pagada y avanza a la siguiente de la lista', () => {
  const sub = baseSub({
    due_dates: JSON.stringify([
      { date: '2026-08-01', amount: 100 },
      { date: '2026-08-15', amount: 120 },
    ]),
  });
  const from = noonUtc('2026-08-01');

  const workerResult = worker.advanceDueDateAfterPayment(sub, from);
  const clientResult = client.advanceDueDateAfterPayment(sub, from);

  assert.equal(workerResult.due_date, '2026-08-15');
  assert.equal(workerResult.due_day, 15);
  assert.deepEqual(JSON.parse(workerResult.due_dates), [{ date: '2026-08-15', amount: 120 }]);
  assert.deepEqual(clientResult, workerResult);
});

test('due_dates: pagar la última fecha de la lista devuelve null (se archiva)', () => {
  const sub = baseSub({ due_dates: JSON.stringify([{ date: '2026-08-01', amount: 100 }]) });
  const from = noonUtc('2026-08-01');

  assert.equal(worker.advanceDueDateAfterPayment(sub, from), null);
  assert.equal(client.advanceDueDateAfterPayment(sub, from), null);
});

test('once: siempre devuelve null (se archiva, no tiene siguiente ocurrencia)', () => {
  const sub = baseSub({ frequency: 'once', due_day: 1, due_date: '2026-08-01' });
  const from = noonUtc('2026-08-01');

  assert.equal(worker.advanceDueDateAfterPayment(sub, from), null);
  assert.equal(client.advanceDueDateAfterPayment(sub, from), null);
});
