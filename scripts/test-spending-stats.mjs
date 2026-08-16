// Tests for src/lib/spending-stats.ts — bundled with esbuild (see
// test-helpers/load-ts-module.mjs) so a regression in the shipped code
// actually fails these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const {
  monthlyEquivalent,
  computeMonthlyTotal,
  computeCategorySlices,
  computeTotalsByCurrency,
  computeBudgetOutlook,
  computeCategoryTotals,
  computeCalendarMonth,
} = await loadTsModule('src/lib/spending-stats.ts');

function baseSub(overrides = {}) {
  return {
    id: 's1',
    name: 'Renta',
    amount: 100,
    currency: 'MXN',
    frequency: 'monthly',
    due_day: 5,
    due_date: '2026-02-05',
    due_dates: null,
    due_days: null,
    interval_count: null,
    interval_unit: null,
    category: null,
    created_at: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function payment(overrides = {}) {
  return {
    id: 'p1',
    subscription_id: 's1',
    amount: 100,
    currency: 'MXN',
    paid_at: '2026-02-10T12:00:00.000Z',
    notes: null,
    subscription_name: 'Renta',
    ...overrides,
  };
}

/** Febrero de 2026 (mes 1), día 10 — mes con 28 días, útil para los clamps. */
const REF = new Date(2026, 1, 10);

test('due_dates se reparte entre 12 meses, usando el monto propio de cada DueDateEntry', () => {
  const sub = baseSub({
    due_dates: JSON.stringify([{ date: '2026-02-05', amount: 150 }, { date: '2026-02-20' }]),
  });
  // (150 override de la primera fecha + 100 monto base de la segunda) / 12,
  // igual sin importar qué mes se consulte — mismo trato que yearly/interval.
  const expected = (150 + 100) / 12;
  assert.equal(monthlyEquivalent(sub, 2026, 1), expected);
  assert.equal(monthlyEquivalent(sub, 2026, 6), expected);
});

test('una suscripción con una sola fecha vía due_dates se reparte como Anual, no solo en su mes', () => {
  // Reproduce el bug real: una fila que el usuario ve etiquetada "Anual"
  // pero que trae un due_dates de una sola fecha (p. ej. porque
  // RecurrenceSheet la guardó vía "Varias fechas", o porque ya se pagaron
  // todas las demás fechas de una lista más larga). Antes de este fix
  // contribuía el monto completo solo en el mes exacto de la fecha y $0 el
  // resto del año — daba un "gasto mensual estimado" completamente engañoso.
  const sub = baseSub({
    frequency: 'yearly',
    due_dates: JSON.stringify([{ date: '2027-08-12', amount: 399 }]),
  });
  assert.equal(monthlyEquivalent(sub, 2026, 7), 399 / 12); // mes distinto al de la fecha
  assert.equal(monthlyEquivalent(sub, 2027, 7), 399 / 12); // el mes exacto de la fecha — ya no da el monto completo
});

test('computeMonthlyTotal suma el equivalente mensual de cada suscripción', () => {
  const subs = [
    baseSub({ id: 'a', amount: 100, frequency: 'monthly' }),
    baseSub({ id: 'b', amount: 1200, frequency: 'yearly' }), // 1200/12 = 100
  ];
  assert.equal(computeMonthlyTotal(subs, REF), 200);
});

// El invariante del repo: los totales nunca se suman entre monedas. Cada
// agregador tiene que agrupar por moneda primero — mezclar MXN con USD produce
// un número que no significa nada.
test('computeTotalsByCurrency separa cada moneda en vez de sumarlas', () => {
  const totals = computeTotalsByCurrency(
    [
      baseSub({ id: 'a', amount: 100, currency: 'MXN' }),
      baseSub({ id: 'b', amount: 50, currency: 'MXN' }),
      baseSub({ id: 'c', amount: 10, currency: 'USD' }),
    ],
    REF
  );

  assert.deepEqual(Object.keys(totals).sort(), ['MXN', 'USD']);
  assert.equal(totals.MXN.monthly, 150);
  assert.equal(totals.USD.monthly, 10);
  assert.ok(!('total' in totals), 'no debe existir un total agregado entre monedas');
});

test('computeTotalsByCurrency trata la moneda vacía como MXN', () => {
  const totals = computeTotalsByCurrency([baseSub({ currency: '' })], REF);
  assert.deepEqual(Object.keys(totals), ['MXN']);
});

test('computeBudgetOutlook solo considera la moneda pedida', () => {
  const subs = [
    baseSub({ id: 'a', amount: 100, currency: 'MXN' }),
    baseSub({ id: 'b', amount: 999, currency: 'USD' }),
  ];
  const payments = [
    payment({ id: 'p1', amount: 40, currency: 'MXN' }),
    payment({ id: 'p2', amount: 500, currency: 'USD' }),
  ];

  const outlook = computeBudgetOutlook(subs, payments, 1000, REF, 'MXN');

  assert.equal(outlook.spent, 40, 'el pago en USD no entra al gasto en MXN');
  assert.equal(outlook.projectedTotal, 100, 'la suscripción en USD no entra a la proyección');
});

test('computeBudgetOutlook ignora pagos de otros meses', () => {
  const payments = [
    payment({ id: 'p1', amount: 40, paid_at: '2026-02-03T12:00:00.000Z' }),
    payment({ id: 'p2', amount: 999, paid_at: '2026-01-28T12:00:00.000Z' }),
  ];
  const outlook = computeBudgetOutlook([], payments, 1000, REF, 'MXN');
  assert.equal(outlook.spent, 40);
});

test('sin presupuesto configurado no se inventa un porcentaje', () => {
  const outlook = computeBudgetOutlook([baseSub()], [], null, REF, 'MXN');
  assert.equal(outlook.pctOfBudget, null);
  assert.equal(outlook.remaining, 0);
  assert.equal(outlook.perDay, 0);
});

test('el disponible por día se calcula sobre lo ya pagado, no sobre la proyección', () => {
  // Decisión de producto documentada en deriveBudgetOutlook: restar lo que aún
  // no se paga daría un número desmoralizante y falso.
  const payments = [payment({ amount: 400 })];
  // Febrero 2026 tiene 28 días; desde el día 10 quedan 19 (incluye hoy).
  const outlook = computeBudgetOutlook([], payments, 1000, REF, 'MXN');

  assert.equal(outlook.remaining, 600);
  assert.equal(outlook.perDay, Math.floor(600 / 19));
});

test('un presupuesto ya rebasado no produce un restante negativo', () => {
  const outlook = computeBudgetOutlook([], [payment({ amount: 1500 })], 1000, REF, 'MXN');
  assert.equal(outlook.remaining, 0);
  assert.equal(outlook.perDay, 0);
  assert.ok(outlook.pctOfBudget > 100, 'pero el % sí refleja el exceso');
});

test('computeCategorySlices agrupa, ordena por monto y reparte 100%', () => {
  const slices = computeCategorySlices(
    [
      baseSub({ id: 'a', amount: 100, category: 'Servicios' }),
      baseSub({ id: 'b', amount: 50, category: 'Servicios' }),
      baseSub({ id: 'c', amount: 200, category: 'Préstamos' }),
    ],
    REF
  );

  assert.deepEqual(
    slices.map((s) => s.category),
    ['Préstamos', 'Servicios'],
    'ordenado por monto descendente'
  );
  assert.equal(slices[0].amount, 200);
  assert.equal(slices[1].amount, 150);
  assert.ok(Math.abs(slices.reduce((sum, s) => sum + s.pct, 0) - 100) < 0.001);
});

test('computeCategorySlices manda las suscripciones sin categoría a Otros', () => {
  const slices = computeCategorySlices(
    [baseSub({ id: 'a', category: null }), baseSub({ id: 'b', category: '   ' })],
    REF
  );
  assert.deepEqual(
    slices.map((s) => s.category),
    ['Otros']
  );
});

test('computeCategorySlices no devuelve hue — el color lo pone categoryColor()', () => {
  const [slice] = computeCategorySlices([baseSub({ category: 'Servicios' })], REF);
  assert.ok(!('hue' in slice), 'pintar la categoría es responsabilidad de categories.ts');
});

test('computeCategoryTotals agrupa pagos reales y calcula promedio y conteo', () => {
  const subs = [baseSub({ id: 's1', category: 'Servicios' })];
  const payments = [
    payment({ id: 'p1', amount: 100, paid_at: '2026-02-03T12:00:00.000Z' }),
    payment({ id: 'p2', amount: 300, paid_at: '2026-02-08T12:00:00.000Z' }),
  ];

  const [bucket] = computeCategoryTotals(subs, payments, 'month', REF);

  assert.equal(bucket.category, 'Servicios');
  assert.equal(bucket.total, 400);
  assert.equal(bucket.count, 2);
  assert.equal(bucket.avg, 200);
  assert.equal(bucket.pct, 100);
  assert.equal(bucket.payments[0].paid_at, '2026-02-08T12:00:00.000Z', 'más reciente primero');
});

test('el rango quarter alcanza los dos meses previos y month no', () => {
  const subs = [baseSub({ id: 's1', category: 'Servicios' })];
  const payments = [
    payment({ id: 'p1', amount: 100, paid_at: '2026-02-03T12:00:00.000Z' }),
    payment({ id: 'p2', amount: 70, paid_at: '2025-12-15T12:00:00.000Z' }),
  ];

  assert.equal(computeCategoryTotals(subs, payments, 'month', REF)[0].total, 100);
  assert.equal(computeCategoryTotals(subs, payments, 'quarter', REF)[0].total, 170);
});

test('un gasto suelto sin suscripción usa su propia categoría', () => {
  // subscription_id null = captura desde Atajos/Siri (migración 0016).
  const payments = [
    payment({ id: 'p1', subscription_id: null, category: 'Comida', subscription_name: 'Tacos' }),
  ];
  const [bucket] = computeCategoryTotals([], payments, 'month', REF);
  assert.equal(bucket.category, 'Comida');
  assert.equal(bucket.payments[0].name, 'Tacos');
});

test('un pago sin categoría propia ni suscripción cae en Sin categoría', () => {
  const payments = [payment({ id: 'p1', subscription_id: null, category: null })];
  const [bucket] = computeCategoryTotals([], payments, 'month', REF);
  assert.equal(bucket.category, 'Sin categoría');
});

test('computeCalendarMonth ubica pagos y vencimientos en su día del mes', () => {
  const subs = [baseSub({ id: 's1', name: 'Renta', due_day: 20, due_date: '2026-02-20' })];
  const payments = [payment({ id: 'p1', paid_at: '2026-02-03T12:00:00.000Z' })];

  const month = computeCalendarMonth(subs, payments, REF);

  assert.equal(month.year, 2026);
  assert.equal(month.month, 1);
  assert.equal(month.itemsByDay.get(3)[0].status, 'pagado');
  assert.equal(month.itemsByDay.get(20)[0].name, 'Renta');
  assert.equal(month.itemsByDay.get(20)[0].status, 'pendiente');
});

test('computeCalendarMonth marca hoy y lo vencido con estados distintos', () => {
  const hoy = baseSub({ id: 'a', name: 'Hoy', due_day: 10, due_date: '2026-02-10' });
  const month = computeCalendarMonth([hoy], [], REF);
  assert.equal(month.itemsByDay.get(10)[0].status, 'hoy');
});

test('computeCalendarMonth descarta pagos de otros meses', () => {
  const payments = [payment({ id: 'p1', paid_at: '2026-01-03T12:00:00.000Z' })];
  const month = computeCalendarMonth([], payments, REF);
  assert.equal(month.itemsByDay.size, 0);
});

test('computeCalendarMonth no duplica un día ya pagado como "vencido" cuando due_dates conserva la fecha vieja', () => {
  // Pago registrado sin pasar por markSubscriptionPaid (import/captura suelta):
  // due_dates sigue trayendo la fecha ya pagada, así que nearestDueFromList
  // cae al bestPast y la marcaría "vencido" en el mismo día que ya es "pagado".
  const sub = baseSub({
    id: 's1',
    name: 'Renta',
    due_dates: JSON.stringify([{ date: '2026-02-05' }]),
    due_date: null,
  });
  const payments = [payment({ id: 'p1', subscription_id: 's1', paid_at: '2026-02-05T12:00:00.000Z' })];

  const month = computeCalendarMonth([sub], payments, REF);

  const dayItems = month.itemsByDay.get(5);
  assert.equal(dayItems.length, 1);
  assert.equal(dayItems[0].status, 'pagado');
});
