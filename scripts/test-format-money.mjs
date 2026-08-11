// Tests for src/lib/format-money.ts — todo el dinero de la UI pasa por acá
// (ningún componente llama a Intl.NumberFormat directo), así que la
// preferencia "Redondear centavos" y la variante compacta se afirman aquí.
//
// ui-prefs se stubea porque lee localStorage, que no existe en node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

/** Carga el módulo con la preferencia de redondeo fijada. */
function withRoundCents(roundCents) {
  return loadTsModule('src/lib/format-money.ts', {
    stubs: { './ui-prefs': { loadRoundCents: () => roundCents } },
  });
}

const exact = await withRoundCents(false);
const rounded = await withRoundCents(true);

test('formatMoney respeta la preferencia de centavos', () => {
  assert.match(exact.formatMoney(1234.56, 'MXN'), /1,234\.56/);
  assert.ok(!/\.\d/.test(rounded.formatMoney(1234.56, 'MXN')), 'redondeado no lleva decimales');
});

test('el símbolo de moneda distingue MXN de USD', () => {
  const mxn = exact.formatMoney(100, 'MXN');
  const usd = exact.formatMoney(100, 'USD');
  assert.notEqual(mxn, usd, 'dos monedas no pueden renderizarse igual');
});

test('formatMoneyCompact quita los decimales a partir de 1000', () => {
  // Es para badges y el centro de la dona: ahí no cabe el detalle.
  assert.ok(!/\.\d/.test(exact.formatMoneyCompact(1234.56, 'MXN')));
});

test('formatMoneyCompact conserva los decimales por debajo de 1000', () => {
  assert.match(exact.formatMoneyCompact(99.5, 'MXN'), /99\.50/);
});

test('formatMoneyCompact ignora la preferencia solo por encima de 1000', () => {
  // Con "redondear" activo, debajo de 1000 delega en formatMoney y sí redondea.
  assert.ok(!/\.\d/.test(rounded.formatMoneyCompact(99.5, 'MXN')));
});

test('el umbral compacto mira el valor absoluto', () => {
  assert.ok(!/\.\d\d/.test(exact.formatMoneyCompact(-1234.56, 'MXN')), 'un negativo grande también');
});

test('el cero se formatea como moneda, no como cadena vacía', () => {
  assert.match(exact.formatMoney(0, 'MXN'), /0/);
});
