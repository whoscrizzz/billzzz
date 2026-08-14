// Tests for src/lib/categories.ts — categoryColor() es la única forma válida de
// pintar una categoría. Reemplazó a tres funciones hash que hardcodeaban su
// propia saturación (48% 44%, 55% 52%, 52% 48%); esa deriva es justo lo que
// centralizarlo evita, así que los valores fijos se afirman acá.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { categoryColor, CATEGORIES } = await loadTsModule('src/lib/categories.ts');
const { groupSubscriptionsByCategory } = await loadTsModule('src/lib/category-groups.ts');

function subscription(id, category, dueDate, amount = 100) {
  return {
    id,
    user_id: 'user-1',
    name: id,
    amount,
    currency: 'MXN',
    due_day: Number(dueDate.slice(8, 10)),
    due_date: dueDate,
    due_dates: null,
    due_days: null,
    interval_count: null,
    interval_unit: null,
    frequency: 'once',
    category,
    notes: null,
    notify_days_before: 1,
    notify_hour: 9,
    snoozed_until: null,
    deleted_at: null,
    trashed_at: null,
    last_paid_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}

/** hsl(<hue> 62% 52%) — saturación y luminosidad del handoff de diseño. */
const COLOR_RE = /^hsl\((\d+(?:\.\d+)?) 62% 52%\)$/;

test('toda categoría real usa la saturación y luminosidad del handoff', () => {
  for (const cat of CATEGORIES) {
    if (cat === 'Otros') continue; // es la ausencia de categoría, ver abajo
    const color = categoryColor(cat);
    assert.match(color, COLOR_RE, `${cat} no respeta 62% 52%: ${color}`);
  }
});

test('las etiquetas que son ausencia de categoría dan un gris neutro', () => {
  const neutral = 'hsl(240 6% 55%)';
  assert.equal(categoryColor('Otros'), neutral);
  assert.equal(categoryColor('Sin categoría'), neutral);
  assert.equal(categoryColor(''), neutral);
  assert.equal(categoryColor('   '), neutral, 'solo espacios también es vacío');
});

test('el vacío no cae en el hash — hashHue("") daría siempre un rojo sin sentido', () => {
  assert.notEqual(categoryColor(''), categoryColor('a'));
  assert.match(categoryColor('a'), COLOR_RE);
});

test('cada categoría de la tabla tiene un tono distinto', () => {
  const reales = CATEGORIES.filter((c) => c !== 'Otros');
  const hues = reales.map((c) => categoryColor(c).match(COLOR_RE)[1]);
  assert.equal(new Set(hues).size, hues.length, 'dos categorías comparten tono');
});

test('una categoría de texto libre recibe un tono estable', () => {
  // La categoría es texto libre (input con datalist en RegisterPanel), así que
  // siempre puede llegar algo fuera de la tabla.
  const primera = categoryColor('Mascotas');
  assert.match(primera, COLOR_RE);
  assert.equal(categoryColor('Mascotas'), primera, 'el mismo texto da el mismo color');
});

test('los espacios alrededor no cambian el color', () => {
  assert.equal(categoryColor('  Servicios  '), categoryColor('Servicios'));
  assert.equal(categoryColor('  Mascotas  '), categoryColor('Mascotas'));
});

test('la tabla fija gana sobre el hash', () => {
  // Si Servicios cayera en hashHue, su tono sería otro; el valor 205 viene del
  // handoff y no debe moverse.
  assert.equal(categoryColor('Servicios'), 'hsl(205 62% 52%)');
  assert.equal(categoryColor('Casa'), 'hsl(172 62% 52%)');
});

test('las columnas y sus pagos se ordenan por la siguiente fecha de vencimiento', () => {
  const groups = groupSubscriptionsByCategory([
    subscription('servicio-tarde', 'Servicios', '2026-08-25', 10_000),
    subscription('casa-pronto', 'Casa', '2026-08-16', 100),
    subscription('servicio-pronto', 'Servicios', '2026-08-18', 10_000),
  ]);

  assert.deepEqual(
    groups.map((group) => group.category),
    ['Casa', 'Servicios']
  );
  assert.deepEqual(
    groups[1].items.map((item) => item.id),
    ['servicio-pronto', 'servicio-tarde']
  );
});
