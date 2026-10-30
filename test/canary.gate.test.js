const test = require('node:test');
const assert = require('node:assert/strict');
const { decide, emptyMeasurement, PROMOTE, PAUSE, ABORT } = require('../canary/gate');
const slo = require('../canary/slo.json');

function measurement(overrides = {}) {
  return { ...emptyMeasurement(), requests: 200, ...overrides };
}

test('PAUSA cuando el canary no tiene suficientes peticiones', () => {
  const { decision, reasons } = decide(slo, measurement({ requests: 10 }), measurement());
  assert.equal(decision, PAUSE);
  assert.match(reasons[0], /not enough samples/);
});

test('PROMUEVE cuando el canary cumple todos los umbrales', () => {
  const canary = measurement({ errors5xx: 0, p95Ms: 400, p99Ms: 600, cpu: 0.3, memory: 0.4, registered: 20 });
  const stable = measurement({ errors5xx: 1, p95Ms: 380, p99Ms: 590, registered: 20 });
  const { decision } = decide(slo, canary, stable);
  assert.equal(decision, PROMOTE);
});

test('ABORTA cuando la tasa de errores 5xx supera el límite de aborto', () => {
  const canary = measurement({ errors5xx: 15 });
  const { decision, reasons } = decide(slo, canary, measurement());
  assert.equal(decision, ABORT);
  assert.match(reasons.join(' '), /5xx/);
});

test('PAUSA (no aborta) con errores por encima de promover pero por debajo de abortar', () => {
  const canary = measurement({ errors5xx: 3 });
  const { decision } = decide(slo, canary, measurement());
  assert.equal(decision, PAUSE);
});

test('ABORTA cuando el p95 del canary es mucho peor que el de la estable', () => {
  const canary = measurement({ p95Ms: 1200 });
  const stable = measurement({ p95Ms: 300 });
  const { decision } = decide(slo, canary, stable);
  assert.equal(decision, ABORT);
});

test('la caída de la tasa de registro exitoso no decide sin muestra suficiente', () => {
  const canary = measurement({ registered: 1, rejected: 0 });
  const stable = measurement({ registered: 20, rejected: 0 });
  const { decision } = decide(slo, canary, stable);
  assert.equal(decision, PROMOTE);
});

test('ABORTA cuando la tasa de registro exitoso cae mucho frente a la estable', () => {
  const canary = measurement({ registered: 5, rejected: 15 });
  const stable = measurement({ registered: 19, rejected: 1 });
  const { decision, reasons } = decide(slo, canary, stable);
  assert.equal(decision, ABORT);
  assert.match(reasons.join(' '), /success rate/);
});
