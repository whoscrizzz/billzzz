// Tests for the Reminders/CSV import parser (src/lib/import-reminders.ts).
// Imports the real module (see test-helpers/load-ts-module.mjs): antes este
// archivo probaba un regex escrito a mano aquí mismo, así que el parser que
// realmente usan RegisterPanel, ImportRemindersPanel y el share-target de
// App.tsx no lo verificaba nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { parseRemindersImport, toSubscriptionInput } = await loadTsModule(
  'src/lib/import-reminders.ts'
);

test('parses amount, date and cadence from pasted Reminders text', () => {
  const rows = parseRemindersImport(
    `Spotify $79
28/06/26 Cada mes

Préstamo Stori $1037.70
03/07/26 Cada semana`
  );

  assert.equal(rows.length, 2);

  assert.equal(rows[0].amount, 79);
  assert.equal(rows[0].due_date, '2026-06-28');
  assert.equal(rows[0].frequency, 'monthly');
  assert.ok(!rows[0].name.includes('$'), 'el monto no debe quedar en el nombre');

  assert.equal(rows[1].amount, 1037.7, 'separador de miles y decimales');
  assert.equal(rows[1].due_date, '2026-07-03');
  assert.equal(rows[1].frequency, 'weekly');
});

test('una fila completa se marca con confianza alta', () => {
  const [row] = parseRemindersImport('Netflix $199\n15/09/26 Cada mes');
  assert.equal(row.confidence, 'high');
});

test('sin fecha la frecuencia degrada a once y baja la confianza', () => {
  // Sin fecha ancla no hay recurrencia que calcular, así que "cada mes" se
  // descarta a propósito en vez de inventar un día de vencimiento.
  const [row] = parseRemindersImport('Gimnasio $500 Cada mes');
  assert.equal(row.due_date, null);
  assert.equal(row.frequency, 'once');
  assert.equal(row.confidence, 'low');
});

test('reconoce USD explícito y usa MXN por defecto', () => {
  const [usd] = parseRemindersImport('iCloud 2.99 USD\n01/08/26 Cada mes');
  assert.equal(usd.currency, 'USD');

  const [mxn] = parseRemindersImport('Rappi $149\n01/08/26 Cada mes');
  assert.equal(mxn.currency, 'MXN');
});

test('una línea sin monto sigue entrando, con amount 0 y confianza baja', () => {
  const [row] = parseRemindersImport('Colegiatura UVM\n10/09/26');
  assert.equal(row.amount, 0);
  assert.equal(row.due_date, '2026-09-10');
  assert.equal(row.confidence, 'low');
  assert.equal(row.category, 'Educación', 'la categoría se infiere del nombre');
});

test('descarta duplicados por nombre + monto + fecha', () => {
  const rows = parseRemindersImport(
    `Spotify $79
28/06/26 Cada mes

Spotify $79
28/06/26 Cada mes`
  );
  assert.equal(rows.length, 1);
});

test('texto vacío devuelve una lista vacía, no una fila basura', () => {
  assert.deepEqual(parseRemindersImport(''), []);
  assert.deepEqual(parseRemindersImport('   \n  '), []);
});

test('una hora pegada desde Recordatorios no contamina el nombre', () => {
  const [row] = parseRemindersImport('Renta $8000\n03/07/26 9:00 a.m. Cada mes');
  assert.ok(!/\d{1,2}:\d{2}/.test(row.name), `la hora quedó en el nombre: "${row.name}"`);
  assert.equal(row.frequency, 'monthly');
});

test('detecta el formato CSV por su encabezado', () => {
  const rows = parseRemindersImport(
    `nombre,monto,fecha,frecuencia,categoria
Spotify,79,2026-06-28,monthly,Suscripciones
Gym,500,2026-07-01,weekly,Salud`
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Spotify');
  assert.equal(rows[0].amount, 79);
  assert.equal(rows[0].due_date, '2026-06-28');
  assert.equal(rows[0].category, 'Suscripciones');
  assert.equal(rows[1].frequency, 'weekly');
});

test('una frecuencia desconocida en CSV cae a monthly', () => {
  const [row] = parseRemindersImport(`nombre,monto,frecuencia
Spotify,79,quincenal`);
  assert.equal(row.frequency, 'monthly');
});

test('toSubscriptionInput traduce weekly a día de la semana', () => {
  // 2026-07-03 es viernes; due_day es 1..7 con domingo = 7.
  const input = toSubscriptionInput({
    name: 'Stori',
    amount: 1037.7,
    currency: 'MXN',
    due_date: '2026-07-03',
    frequency: 'weekly',
    category: undefined,
    confidence: 'high',
    raw: '',
  });

  assert.equal(input.frequency, 'weekly');
  assert.equal(input.due_day, 5);
  assert.equal(input.notify_days_before, 1, 'semanal avisa con menos anticipación');
});

test('toSubscriptionInput nunca deja un monto en cero', () => {
  // La fila sin monto entra al importador, pero una suscripción de $0 no es
  // representable: se sube a 1 para que el usuario la corrija visible.
  const input = toSubscriptionInput({
    name: 'Colegiatura',
    amount: 0,
    currency: 'MXN',
    due_date: null,
    frequency: 'once',
    category: 'Educación',
    confidence: 'low',
    raw: '',
  });

  assert.equal(input.amount, 1);
  assert.equal(input.frequency, 'once');
  assert.match(input.due_date, /^\d{4}-\d{2}-\d{2}$/, 'sin fecha usa hoy');
});
