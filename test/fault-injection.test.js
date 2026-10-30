const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');
const { parseFault } = require('../src/fault-injection');

test('parseFault lee tasa de error y latencia, ignora lo que no entiende', () => {
  assert.deepEqual(parseFault('error=0.5;latency=800'), { errorRate: 0.5, latencyMs: 800 });
  assert.deepEqual(parseFault('latency=99999'), { errorRate: 0, latencyMs: 5000 });
  assert.deepEqual(parseFault('error=xyz;latency=abc'), { errorRate: 0, latencyMs: 0 });
});

test('Sin FAULT_INJECTION=true, la cabecera X-Fault no tiene efecto', async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: 'GET',
    url: '/api/v3/notas-medicas',
    headers: { 'x-fault': 'error=1' },
  });

  assert.equal(response.statusCode, 200);
});

test('Con FAULT_INJECTION=true, error=1 fuerza un 500 en rutas /api', async (t) => {
  process.env.FAULT_INJECTION = 'true';
  t.after(() => delete process.env.FAULT_INJECTION);
  const app = await buildApp();

  const response = await app.inject({
    method: 'GET',
    url: '/api/v3/notas-medicas',
    headers: { 'x-fault': 'error=1' },
  });

  assert.equal(response.statusCode, 500);
});

test('La inyección de fallos no afecta /health ni rutas fuera de /api', async (t) => {
  process.env.FAULT_INJECTION = 'true';
  t.after(() => delete process.env.FAULT_INJECTION);
  const app = await buildApp();

  const response = await app.inject({
    method: 'GET',
    url: '/health',
    headers: { 'x-fault': 'error=1' },
  });

  assert.equal(response.statusCode, 200);
});
