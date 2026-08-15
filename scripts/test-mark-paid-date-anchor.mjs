// Regresión: al marcar pagado con una fecha elegida en <input type="date">
// (fecha-sin-hora), el worker la interpretaba como medianoche UTC — para
// usuarios al oeste de UTC (default de la app: America/Mexico_City) eso
// retrocedía un día al mostrarla. normalizePaidAt ancla esas fechas a
// mediodía UTC, que cae en el mismo día calendario para todo el rango de
// timezones soportadas (worker/src/timezone.ts, UTC-8..UTC+2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { normalizePaidAt } = await loadTsModule('worker/src/subscriptions.ts');

function readsAsDay(iso, timeZone, expected) {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
  assert.equal(formatted, expected, `${iso} in ${timeZone} should read ${expected}`);
}

test('normalizePaidAt anchors a date-only string to the same calendar day everywhere', () => {
  const iso = normalizePaidAt('2026-08-10');
  assert.ok(iso);
  readsAsDay(iso, 'America/Mexico_City', '2026-08-10');
  readsAsDay(iso, 'America/Los_Angeles', '2026-08-10'); // UTC-8, western edge of the allowlist
  readsAsDay(iso, 'Europe/Madrid', '2026-08-10'); // UTC+2 (summer), eastern edge of the allowlist
});

test('normalizePaidAt leaves a full timestamp unchanged', () => {
  const iso = normalizePaidAt('2026-08-10T23:00:00.000Z');
  assert.equal(iso, new Date('2026-08-10T23:00:00.000Z').toISOString());
});

test('normalizePaidAt returns null for an unparseable date', () => {
  assert.equal(normalizePaidAt('not-a-date'), null);
  assert.equal(normalizePaidAt('2026-13-40'), null);
});
