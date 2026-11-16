const test = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: sleep } = require('node:timers/promises');
const { buildApp } = require('../src/app');
const { resetDatabase, createImage } = require('./helpers');
const { startPeerMock } = require('../chaos/mocks/peer-mock');

// Round 1 behaviour: timeout per dependency + circuit breaker + degraded answer
let angel;
let juan;

test.before(async () => {
  angel = await startPeerMock({ name: 'angel' });
  juan = await startPeerMock({ name: 'juan' });
  process.env.API_C_URL = angel.url;
  process.env.API_A_URL = juan.url;
  process.env.RESILIENCE_ENABLED = 'true';
});

test.after(async () => {
  await angel.close();
  await juan.close();
  delete process.env.API_C_URL;
  delete process.env.API_A_URL;
  delete process.env.RESILIENCE_ENABLED;
});

test.beforeEach(async () => {
  await resetDatabase();
  angel.reset(); angel.setDelay(0); angel.setFail(false);
  juan.reset(); juan.setDelay(0); juan.setFail(false);
});

// Small thresholds so the tests run in milliseconds; production values live
// in src/v5/config.js
const buildRound1 = (overrides = {}) => buildApp({
  chaos: { cacheTtlMs: 0 },
  resilience: {
    timeoutMs: 150,
    breaker: { volumeThreshold: 2, errorThresholdPercentage: 50, resetTimeout: 300, rollingCountTimeout: 1000 },
    ...overrides,
  },
});

test('V5 ronda 1: un compañero lento se corta por timeout y el flujo responde degradado', async () => {
  const app = await buildRound1();
  const image = await createImage();
  angel.setDelay(600);

  const startedAt = Date.now();
  const response = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  const elapsed = Date.now() - startedAt;

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-degraded'], 'true');
  assert.equal(response.headers['x-ronda'], '1');
  const body = response.json();
  assert.equal(body.ronda, '1');
  assert.equal(body.degradado, true);
  assert.equal(body.animal, null);
  assert.equal(body.dependencias.angel.estado, 'timeout');
  // The chain continues: Juan is still called and answers
  assert.equal(body.dependencias.juan.estado, 'ok');
  assert.equal(body.vuelo.numero, 'V-050');
  assert.ok(elapsed < 500, `el flujo tardó ${elapsed} ms, el timeout era 150 ms`);
});

test('V5 ronda 1: el circuito se abre tras fallos repetidos y luego se cierra', async () => {
  const app = await buildRound1();
  const image = await createImage();
  angel.setFail(true);

  // volumeThreshold = 2: the first two failures count, the third call is skipped
  await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  const tercera = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });

  assert.equal(tercera.statusCode, 200);
  assert.equal(tercera.json().dependencias.angel.estado, 'circuito_abierto');
  assert.equal(angel.state.requests.length, 2, 'con el circuito abierto no se llama al compañero');

  let metrics = await app.inject({ method: 'GET', url: '/metrics' });
  assert.match(metrics.body, /circuit_breaker_state\{peer="angel"\} 1/);
  assert.match(metrics.body, /flow_requests_total\{outcome="degradado"[^}]*round="1"[^}]*\} 3/);

  // After resetTimeout the breaker lets one probe through; with a healthy peer it closes
  angel.setFail(false);
  await sleep(350);
  const recuperada = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  assert.equal(recuperada.json().dependencias.angel.estado, 'ok');
  assert.equal(recuperada.json().degradado, false);
  metrics = await app.inject({ method: 'GET', url: '/metrics' });
  assert.match(metrics.body, /circuit_breaker_state\{peer="angel"\} 0/);
});

test('V5 ronda 1: un 404 del compañero no abre el circuito', async () => {
  const app = await buildRound1();
  const image = await createImage();
  // Point Angel at a path the mock does not serve
  const original = process.env.API_C_URL;
  process.env.API_C_URL = `${angel.url}/otra-base`;

  try {
    for (let i = 0; i < 3; i += 1) {
      const response = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
      assert.equal(response.json().dependencias.angel.estado, 'error');
    }
    assert.equal(angel.state.requests.length, 3, 'todas las llamadas llegaron al mock');
  } finally {
    process.env.API_C_URL = original;
  }
});

test('V5 ronda 1: los dos compañeros caídos siguen dando una respuesta 200 con la imagen', async () => {
  const app = await buildRound1();
  const image = await createImage();
  angel.setFail(true);
  juan.setFail(true);

  const response = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.degradado, true);
  assert.equal(body.imagen.id, image.id);
  assert.equal(body.animal, null);
  assert.equal(body.vuelo, null);
});
