const test = require('node:test');
const assert = require('node:assert/strict');
const { promote } = require('../canary/promote');
const { emptyMeasurement } = require('../canary/gate');
const slo = require('../canary/slo.json');

function healthyMeasurement() {
  return { ...emptyMeasurement(), requests: 400, p95Ms: 400, p99Ms: 600, registered: 20 };
}

function fakeEnv(measurements) {
  const calls = { traffic: [], load: [], measure: 0, sleep: [] };
  return {
    calls,
    env: {
      setTraffic: async (split) => calls.traffic.push(split),
      generateLoad: async (seconds) => calls.load.push(seconds),
      measure: async () => {
        const result = measurements[calls.measure] || measurements[measurements.length - 1];
        calls.measure += 1;
        return result;
      },
      sleep: async (seconds) => calls.sleep.push(seconds),
    },
  };
}

test('promueve hasta el 100% cuando todas las etapas pasan', async () => {
  const { env, calls } = fakeEnv([
    { canary: healthyMeasurement(), stable: healthyMeasurement() },
    { canary: healthyMeasurement(), stable: healthyMeasurement() },
  ]);

  const code = await promote(slo, [10, 100], 1, 1, 'canary-rev', 'stable-rev', env, () => {});

  assert.equal(code, 0);
  assert.deepEqual(calls.traffic.at(-1), { 'stable-rev': 0, 'canary-rev': 100 });
});

test('aborta y revierte el tráfico cuando una etapa falla', async () => {
  const unhealthy = { canary: { ...emptyMeasurement(), requests: 400, errors5xx: 30 }, stable: healthyMeasurement() };
  const { env, calls } = fakeEnv([unhealthy]);

  const code = await promote(slo, [10, 50, 100], 1, 1, 'canary-rev', 'stable-rev', env, () => {});

  assert.equal(code, 20);
  assert.deepEqual(calls.traffic.at(-1), { 'stable-rev': 100, 'canary-rev': 0 });
  assert.equal(calls.traffic.length, 2);
});

test('reintenta en PAUSA y aborta si no hay evidencia suficiente', async () => {
  const noSample = { canary: emptyMeasurement(), stable: emptyMeasurement() };
  const { env, calls } = fakeEnv([noSample]);

  const code = await promote(slo, [10], 1, 1, 'canary-rev', 'stable-rev', env, () => {});

  assert.equal(code, 20);
  assert.equal(calls.measure, slo.pausa.reintentosMax + 1);
});
