// Regression: choosing a perpetual monthly/quincenal recurrence used to clear
// due_date in RecurrenceSheet. The Worker also normalized create differently
// from update, so an edit could write NULL back to D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const clientDates = await loadTsModule('src/lib/due-dates.ts');
const workerDates = await loadTsModule('worker/src/due-dates.ts');
const workerSubscriptions = await loadTsModule('worker/src/subscriptions.ts');

const referenceDate = new Date('2026-08-21T12:00:00.000Z');

test('mensual materializa la siguiente fecha local sin perder due_day', () => {
  assert.equal(clientDates.nextDueDateForMonthDays([31], referenceDate), '2026-08-31');
  assert.equal(clientDates.nextDueDateForMonthDays([15], referenceDate), '2026-09-15');
});

test('quincenal materializa la fecha más cercana de la regla perpetua', () => {
  assert.equal(clientDates.nextDueDateForMonthDays([1, 15], referenceDate), '2026-09-01');
});

test('el normalizador del Worker guarda due_date para mensual con solo due_day', () => {
  assert.deepEqual(
    workerSubscriptions.normalizeSubscriptionRecurrence(
      { frequency: 'monthly', due_day: 15 },
      referenceDate
    ),
    {
      due_date: '2026-09-15',
      due_day: 15,
      due_dates: null,
      due_days: null,
    }
  );
});

test('el Worker usa el día calendario del usuario y no el día UTC', () => {
  const mexicoNight = new Date('2026-09-01T02:00:00.000Z');
  assert.deepEqual(
    workerSubscriptions.normalizeSubscriptionRecurrence(
      { frequency: 'monthly', due_day: 31 },
      mexicoNight,
      'America/Mexico_City'
    ),
    {
      due_date: '2026-08-31',
      due_day: 31,
      due_dates: null,
      due_days: null,
    }
  );
});

test('el normalizador del Worker materializa due_days y conserva la regla', () => {
  assert.deepEqual(
    workerSubscriptions.normalizeSubscriptionRecurrence(
      { frequency: 'monthly', due_day: 1, due_days: [1, 15] },
      referenceDate
    ),
    {
      due_date: '2026-09-01',
      due_day: 1,
      due_dates: null,
      due_days: '[1,15]',
    }
  );
});

test('rechaza días imposibles aunque tengan formato YYYY-MM-DD', () => {
  assert.equal(workerDates.isValidIsoDate('2028-02-29'), true);
  assert.equal(workerDates.isValidIsoDate('2026-02-29'), false);
  assert.equal(workerDates.isValidIsoDate('2026-02-31'), false);
  assert.equal(workerDates.isValidIsoDate('2026-13-01'), false);

  assert.deepEqual(
    workerSubscriptions.normalizeSubscriptionRecurrence(
      { frequency: 'monthly', due_date: '2026-02-31', due_day: 28 },
      referenceDate
    ),
    { error: 'due_date debe ser una fecha calendario YYYY-MM-DD válida' }
  );
});

test('rechaza una fecha imposible dentro de due_dates en vez de descartarla silenciosamente', () => {
  assert.deepEqual(
    workerSubscriptions.normalizeSubscriptionRecurrence(
      {
        frequency: 'monthly',
        due_day: 28,
        due_dates: [{ date: '2026-02-31' }],
      },
      referenceDate
    ),
    { error: 'Cada entrada de due_dates debe contener una fecha calendario YYYY-MM-DD válida' }
  );
});

test('editar solo due_day reemplaza la due_date materializada en D1', async () => {
  const current = {
    id: 'subscription-1',
    user_id: 'user-1',
    frequency: 'monthly',
    due_date: '2026-08-15',
    due_day: 15,
    due_dates: null,
    due_days: null,
    interval_count: null,
    interval_unit: null,
  };
  let updateStatement = null;

  const db = {
    prepare(sql) {
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          return current;
        },
        async run() {
          updateStatement = { sql, args: this.args };
          return { meta: { changes: 1 } };
        },
      };
    },
  };

  const request = new Request('https://example.test/subscriptions/subscription-1', {
    method: 'PUT',
    body: JSON.stringify({ due_day: 20 }),
  });

  const response = await workerSubscriptions.updateSubscription(
    request,
    db,
    'user-1',
    'subscription-1'
  );
  assert.equal(response.status, 200);
  assert.ok(updateStatement);

  const setClause = /SET ([\s\S]+?)\s+WHERE/.exec(updateStatement.sql)?.[1];
  assert.ok(setClause);
  const columns = setClause.split(',').map((assignment) => assignment.trim().split(' = ')[0]);
  const values = Object.fromEntries(
    columns.map((column, index) => [column, updateStatement.args[index]])
  );

  assert.match(values.due_date, /^\d{4}-\d{2}-20$/);
  assert.notEqual(values.due_date, current.due_date);
  assert.equal(values.due_day, 20);
  assert.equal(values.due_dates, null);
  assert.equal(values.due_days, null);
});

test('rechaza amount null al editar sin escribir NULL en amount_minor', async () => {
  let dbCalls = 0;
  const db = {
    prepare() {
      dbCalls++;
      throw new Error('no debe consultar D1 para una solicitud inválida');
    },
  };
  const request = new Request('https://example.test/subscriptions/subscription-1', {
    method: 'PUT',
    body: JSON.stringify({ amount: null }),
  });

  const response = await workerSubscriptions.updateSubscription(
    request,
    db,
    'user-1',
    'subscription-1'
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'amount no puede ser null' });
  assert.equal(dbCalls, 0);
});
