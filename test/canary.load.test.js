const test = require('node:test');
const assert = require('node:assert/strict');
const { percentile, tally } = require('../canary/load');

test('percentile calcula p50 y p95 sobre una lista ordenada', () => {
  const valores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(valores, 0.5), 50);
  assert.equal(percentile(valores, 0.95), 100);
});

test('percentile de una lista vacía es 0', () => {
  assert.equal(percentile([], 0.95), 0);
});

test('tally agrupa por track y cuenta errores y latencias por separado', () => {
  const outcomes = [
    { statusCode: 200, track: 'stable', latencyMs: 10 },
    { statusCode: 500, track: 'stable', latencyMs: 20 },
    { statusCode: 200, track: 'canary', latencyMs: 30 },
  ];

  const result = tally(outcomes);

  assert.equal(result.stable.total, 2);
  assert.equal(result.stable.errors, 1);
  assert.equal(result.canary.total, 1);
  assert.equal(result.canary.errors, 0);
});

test('tally agrupa como "desconocido" cuando no hay cabecera X-Track', () => {
  const result = tally([{ statusCode: 200, track: null, latencyMs: 5 }]);
  assert.equal(result.desconocido.total, 1);
});
