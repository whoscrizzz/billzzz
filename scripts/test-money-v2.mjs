import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const money = await loadTsModule('worker/src/money.ts');

test('convierte montos de API a centavos y de vuelta', () => {
  assert.equal(money.toMinorUnits(0), 0);
  assert.equal(money.toMinorUnits(10.29), 1029);
  assert.equal(money.fromMinorUnits(1029), 10.29);
});

test('rechaza fracciones menores a un centavo y valores inválidos', () => {
  for (const value of [-1, 1.001, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(money.toMinorUnits(value), null, String(value));
  }
});

test('valida las únicas monedas soportadas', () => {
  assert.equal(money.isSupportedCurrency('MXN'), true);
  assert.equal(money.isSupportedCurrency('USD'), true);
  assert.equal(money.isSupportedCurrency('EUR'), false);
});

test('congela FX en micros', () => {
  assert.equal(money.toFxMicros(18.5), 18_500_000);
  assert.equal(money.fromFxMicros(18_500_000), 18.5);
  assert.equal(money.toFxMicros(0), null);
});
