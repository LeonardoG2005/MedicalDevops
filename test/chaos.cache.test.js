const test = require('node:test');
const assert = require('node:assert/strict');
const { createFaultCache } = require('../src/chaos/repository');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Repository double: the "table" is an array the test mutates
function repositorioFalso(filas) {
  return { listActive: async () => filas.slice() };
}

// Records the last value published per peer/type, like the gauge
function metricasFalsas() {
  const valores = {};
  return { valores, setFaultActive: (peer, type, active) => { valores[`${peer}:${type}`] = active ? 1 : 0; } };
}

test('Cache: sin trafico, el temporizador baja el indicador cuando el fallo desaparece de la tabla', async () => {
  const filas = [{ peer: 'angel', latency_ms: 3000, error_rate: 0 }];
  const metrics = metricasFalsas();
  const cache = createFaultCache({ repository: repositorioFalso(filas), ttlMs: 3000, refreshEveryMs: 20, metrics });
  try {
    await cache.get();
    assert.equal(metrics.valores['angel:latencia'], 1);

    filas.length = 0; // fault removed from another pod, no request reaches this one
    await esperar(80);

    assert.equal(metrics.valores['angel:latencia'], 0);
  } finally {
    cache.stop();
  }
});

test('Cache: sin temporizador (refreshEveryMs = 0) el indicador se queda en el ultimo valor visto', async () => {
  const filas = [{ peer: 'angel', latency_ms: 3000, error_rate: 0 }];
  const metrics = metricasFalsas();
  const cache = createFaultCache({ repository: repositorioFalso(filas), ttlMs: 3000, metrics });

  await cache.get();
  filas.length = 0;
  await esperar(80);

  assert.equal(metrics.valores['angel:latencia'], 1);
  cache.stop();
});

test('Cache: stop detiene el temporizador', async () => {
  let lecturas = 0;
  const cache = createFaultCache({ repository: { listActive: async () => { lecturas += 1; return []; } }, refreshEveryMs: 10 });
  await esperar(45);
  cache.stop();
  const antes = lecturas;
  await esperar(45);

  assert.ok(antes > 0);
  assert.equal(lecturas, antes);
});
