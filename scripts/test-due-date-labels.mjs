import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const dueDates = await loadTsModule('src/lib/due-dates.ts');

test('formatDueLabel usa texto más claro para hoy y vencidos', () => {
  const sub = {
    frequency: 'monthly',
    due_day: 10,
    due_date: '2026-08-10',
    due_dates: [
      { date: '2026-08-10', amount: 100 },
      { date: '2026-08-25', amount: 100 },
    ],
    due_days: null,
    interval_count: null,
    interval_unit: null,
    created_at: '2025-01-01T00:00:00.000Z',
    snoozed_until: null,
  };

  assert.equal(dueDates.formatDueLabel(sub, 0), 'Hoy · 1 de 2 fechas');
  assert.equal(dueDates.formatDueLabel(sub, -2), 'Hace 2 días');

  const threeDates = {
    ...sub,
    due_dates: [...sub.due_dates, { date: '2026-09-10', amount: 100 }],
  };
  assert.equal(dueDates.formatDueLabel(threeDates, 0), 'Hoy · 1 de 3 fechas');
});

test('formatNextDueDate es más compacto y no añade año en la tarjeta', () => {
  const sub = {
    frequency: 'monthly',
    due_day: 13,
    due_date: '2026-08-13',
    due_dates: null,
    due_days: null,
    interval_count: null,
    interval_unit: null,
    created_at: '2025-01-01T00:00:00.000Z',
    snoozed_until: null,
  };

  assert.equal(dueDates.formatNextDueDate(sub, new Date('2026-08-10T00:00:00Z')), '13 ago');
});

test('nextDueIsoDate usa due_day, no un due_date viejo, cuando due_date está limpio', () => {
  // Regresión: RecurrenceSheet ahora limpia due_date al guardar 'monthly' de un
  // solo día (ver EditSubscriptionModal.tsx), así que due_day debe ser la única
  // fuente de verdad. Si due_date quedara con una fecha vieja todavía vigente,
  // nextMonthlyDueTs la devolvería tal cual e ignoraría due_day (ese era el bug).
  const sub = {
    frequency: 'monthly',
    due_day: 25,
    due_date: null,
    due_dates: null,
    due_days: null,
    interval_count: null,
    interval_unit: null,
    created_at: '2025-01-01T00:00:00.000Z',
    snoozed_until: null,
  };

  assert.equal(dueDates.nextDueIsoDate(sub, new Date('2026-08-10T00:00:00Z')), '2026-08-25');

  // Si el usuario cambia due_day a un día anterior al de hoy, debe rodar al
  // siguiente mes en vez de quedarse pegado a cualquier due_date residual.
  const earlierDay = { ...sub, due_day: 5 };
  assert.equal(dueDates.nextDueIsoDate(earlierDay, new Date('2026-08-10T00:00:00Z')), '2026-09-05');
});

test('describeRecurrence prioriza due_dates sobre frequency, igual que la resolución de fechas', () => {
  // Una fila puede traer due_dates aunque frequency todavía diga 'yearly'
  // (RecurrenceSheet "Varias fechas" no cambia frequency, o le quedó una
  // sola fecha tras marcarse pagada varias veces) — describeRecurrence no
  // debe mostrar la etiqueta vieja de frequency en ese caso.
  const base = {
    frequency: 'yearly',
    due_day: 12,
    due_date: '2027-08-12',
    due_days: null,
    interval_count: null,
    interval_unit: null,
    created_at: '2025-01-01T00:00:00.000Z',
  };

  assert.equal(
    dueDates.describeRecurrence({ ...base, due_dates: JSON.stringify([{ date: '2027-08-12' }]) }),
    '1 fecha'
  );
  assert.equal(
    dueDates.describeRecurrence({
      ...base,
      due_dates: JSON.stringify([{ date: '2027-01-01' }, { date: '2027-06-01' }]),
    }),
    '2 fechas'
  );
  assert.equal(dueDates.describeRecurrence({ ...base, due_dates: null }), 'Anual');
});
