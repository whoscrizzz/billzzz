// Tests for src/lib/categories.ts — categoryColor() es la única forma válida de
// pintar una categoría. Reemplazó a tres funciones hash que hardcodeaban su
// propia saturación (48% 44%, 55% 52%, 52% 48%); esa deriva es justo lo que
// centralizarlo evita, así que los valores fijos se afirman acá.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { categoryColor, CATEGORIES } = await loadTsModule('src/lib/categories.ts');

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
