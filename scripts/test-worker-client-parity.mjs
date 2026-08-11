// Guarda contra la deriva entre las copias paralelas de worker/src y src/lib.
//
// Worker y SPA son bundles separados sin imports compartidos, así que
// due-dates-json.ts y la lista de zonas existen dos veces a propósito. Ambos
// archivos se comentan a sí mismos con "keep in sync" — hasta ahora nada lo
// verificaba, y una divergencia parte en dos la matemática de vencimientos
// entre cliente y servidor sin que ningún test lo note.
//
// Se comparan solo las funciones puras: el plumbing de fechas SÍ diverge a
// propósito (el worker resuelve el día en la zona del usuario, el cliente en
// la del navegador), así que las que dependen de "hoy" quedan fuera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const workerJson = await loadTsModule('worker/src/due-dates-json.ts');
const clientJson = await loadTsModule('src/lib/due-dates-json.ts');
const workerTz = await loadTsModule('worker/src/timezone.ts');
const clientTz = await loadTsModule('src/lib/notify-timezone.ts');

test('la allowlist de zonas es la misma en worker y cliente, en el mismo orden', () => {
  // El orden importa: es el orden del <select> de Ajustes, y el worker valida
  // contra esta misma lista.
  assert.deepEqual(
    clientTz.SUPPORTED_TIMEZONES.map((t) => t.value),
    [...workerTz.SUPPORTED_TIMEZONES]
  );
});

test('la zona por defecto coincide', () => {
  assert.equal(clientTz.NOTIFY_TIMEZONE, workerTz.NOTIFY_TIMEZONE);
});

test('toda zona de la lista del cliente pasa la validación del worker', () => {
  for (const { value } of clientTz.SUPPORTED_TIMEZONES) {
    assert.ok(workerTz.isValidTimezone(value), `el worker rechaza ${value}`);
  }
});

test('due-dates-json exporta el mismo conjunto de funciones en ambos lados', () => {
  const fns = (mod) =>
    Object.keys(mod)
      .filter((k) => typeof mod[k] === 'function')
      .sort();
  assert.deepEqual(fns(clientJson), fns(workerJson));
});

const PURE_CASES = [
  ['isValidIso', ['2026-02-05']],
  ['isValidIso', ['2026-2-5']],
  ['isValidIso', ['no-es-fecha']],
  ['isValidIso', ['']],
  ['isValidDueDay', [1]],
  ['isValidDueDay', [31]],
  ['isValidDueDay', [0]],
  ['isValidDueDay', [32]],
  ['isValidDueDay', ['15']],
  ['parseDueDaysList', [{ due_days: '[1,15]' }]],
  ['parseDueDaysList', [{ due_days: [1, 15] }]],
  ['parseDueDaysList', [{ due_days: null }]],
  ['parseDueDaysList', [{ due_days: 'no es json' }]],
  ['serializeDueDays', [[15, 1]]],
  ['serializeDueDays', [[]]],
  ['serializeDueDates', [[{ date: '2026-02-05', amount: 150 }]]],
  ['serializeDueDates', [[]]],
  ['removeDueDate', [[{ date: '2026-02-05' }, { date: '2026-02-20' }], '2026-02-05']],
  ['resolveAmountForDate', [{ amount: 100, due_dates: null }, '2026-02-05']],
  [
    'resolveAmountForDate',
    [{ amount: 100, due_dates: JSON.stringify([{ date: '2026-02-05', amount: 150 }]) }, '2026-02-05'],
  ],
  ['parseDueDates', [{ due_dates: JSON.stringify([{ date: '2026-02-05', amount: 150 }]) }]],
  ['parseDueDates', [{ due_dates: JSON.stringify(['2026-02-05']) }]],
  ['parseDueDates', [{ due_dates: null, due_date: '2026-02-05' }]],
  ['parseDueDates', [{ due_dates: null, due_date: null }]],
  ['parseDueDates', [{ due_dates: 'no es json' }]],
];

test('las funciones puras de due-dates-json dan el mismo resultado en ambas copias', () => {
  for (const [fn, args] of PURE_CASES) {
    const label = `${fn}(${args.map((a) => JSON.stringify(a)).join(', ')})`;
    assert.deepEqual(
      clientJson[fn](...args),
      workerJson[fn](...args),
      `deriva entre copias en ${label}`
    );
  }
});

test('los casos de paridad cubren todas las funciones puras exportadas', () => {
  // Si alguien agrega un export puro y no lo cubre acá, la deriva vuelve a
  // pasar desapercibida.
  const cubiertas = new Set(PURE_CASES.map(([fn]) => fn));
  const dependenDeHoy = new Set(['currentDueAmount', 'nearestDueFromList']);
  const exportadas = Object.keys(workerJson).filter((k) => typeof workerJson[k] === 'function');

  const sinCubrir = exportadas.filter((fn) => !cubiertas.has(fn) && !dependenDeHoy.has(fn));
  assert.deepEqual(sinCubrir, [], `funciones puras sin caso de paridad: ${sinCubrir.join(', ')}`);
});
