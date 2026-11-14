const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');
const { pool, resetDatabase, createImage } = require('./helpers');
const { startPeerMock } = require('../chaos/mocks/peer-mock');

const TOKEN = 'token-de-prueba-0123456789';
const auth = { 'x-chaos-token': TOKEN };

let angel;
let juan;

test.before(async () => {
  angel = await startPeerMock({ name: 'angel' });
  juan = await startPeerMock({ name: 'juan' });
  process.env.API_C_URL = angel.url;
  process.env.API_A_URL = juan.url;
});

test.after(async () => {
  await angel.close();
  await juan.close();
  delete process.env.API_C_URL;
  delete process.env.API_A_URL;
});

test.beforeEach(async () => {
  await resetDatabase();
  angel.reset();
  juan.reset();
  delete process.env.CHAOS_ENABLED;
  delete process.env.CHAOS_TOKEN;
  delete process.env.RESILIENCE_ENABLED;
});

const enable = () => {
  process.env.CHAOS_ENABLED = 'true';
  process.env.CHAOS_TOKEN = TOKEN;
};
const build = (options = {}) => buildApp({ chaos: { cacheTtlMs: 0 }, ...options });

test('Chaos: sin CHAOS_ENABLED las rutas /internal/chaos no existen', async () => {
  const app = await build();

  const response = await app.inject({ method: 'GET', url: '/internal/chaos', headers: auth });

  assert.equal(response.statusCode, 404);
});

test('Chaos: con CHAOS_ENABLED pero sin un token suficiente la app no arranca', async () => {
  process.env.CHAOS_ENABLED = 'true';
  process.env.CHAOS_TOKEN = 'corto';

  await assert.rejects(build(), /CHAOS_TOKEN/);
});

test('Chaos: sin token o con token incorrecto responde 401', async () => {
  enable();
  const app = await build();

  const sinToken = await app.inject({ method: 'GET', url: '/internal/chaos' });
  const malToken = await app.inject({ method: 'GET', url: '/internal/chaos', headers: { 'x-chaos-token': 'x'.repeat(TOKEN.length) } });

  assert.equal(sinToken.statusCode, 401);
  assert.equal(malToken.statusCode, 401);
});

test('Chaos: activar latencia hacia Angel retrasa la llamada saliente y enciende la métrica', async () => {
  enable();
  const app = await build();
  const image = await createImage();

  const activar = await app.inject({
    method: 'POST',
    url: '/internal/chaos',
    headers: auth,
    payload: { peer: 'angel', latency_ms: 300, ttl_seconds: 60, motivo: 'prueba' },
  });
  assert.equal(activar.statusCode, 201);
  assert.equal(activar.json().peer, 'angel');
  assert.equal(activar.json().latency_ms, 300);

  const startedAt = Date.now();
  const flujo = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  const elapsed = Date.now() - startedAt;

  assert.equal(flujo.statusCode, 200);
  assert.ok(elapsed >= 300, `el flujo tardó ${elapsed} ms`);
  assert.ok(flujo.json().dependencias.angel.duracion_ms >= 300);
  // The incoming request itself was not delayed: the mock saw the call late
  assert.ok(angel.state.requests[0].at - startedAt >= 300);

  const listado = await app.inject({ method: 'GET', url: '/internal/chaos', headers: auth });
  assert.equal(listado.json().length, 1);
  assert.ok(listado.json()[0].segundos_restantes > 0);

  const metrics = await app.inject({ method: 'GET', url: '/metrics' });
  assert.match(metrics.body, /chaos_fault_active\{peer="angel",type="latencia"\} 1/);
  assert.match(metrics.body, /chaos_fault_active\{peer="juan",type="latencia"\} 0/);
});

test('Chaos: error_rate=1 hace fallar la dependencia; 502 en ronda 0 y degradado en ronda 1', async () => {
  enable();
  const app0 = await build();
  const image = await createImage();

  await app0.inject({ method: 'POST', url: '/internal/chaos', headers: auth, payload: { peer: 'juan', error_rate: 1, ttl_seconds: 60 } });

  const ronda0 = await app0.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  assert.equal(ronda0.statusCode, 502);
  assert.equal(ronda0.json().dependencias.juan.estado, 'error');
  assert.equal(juan.state.requests.length, 0, 'el fallo inyectado no llega al compañero');

  process.env.RESILIENCE_ENABLED = 'true';
  const app1 = await build();
  const ronda1 = await app1.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  assert.equal(ronda1.statusCode, 200);
  assert.equal(ronda1.json().degradado, true);
  assert.equal(ronda1.json().vuelo, null);
  assert.equal(ronda1.json().animal.data.nombre, 'Firulais');
});

test('Chaos: un fallo vencido no se aplica (reversión automática por TTL)', async () => {
  enable();
  const app = await build();
  const image = await createImage();
  await pool.query(
    "INSERT INTO chaos_faults (peer, latency_ms, expires_at) VALUES ('angel', 5000, now() - interval '1 second')",
  );

  const listado = await app.inject({ method: 'GET', url: '/internal/chaos', headers: auth });
  assert.deepEqual(listado.json(), []);

  const startedAt = Date.now();
  const flujo = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  assert.equal(flujo.statusCode, 200);
  assert.ok(Date.now() - startedAt < 1000);
});

test('Chaos: DELETE revierte el fallo y apaga la métrica', async () => {
  enable();
  const app = await build();
  const image = await createImage();
  await app.inject({ method: 'POST', url: '/internal/chaos', headers: auth, payload: { peer: 'angel', latency_ms: 400, ttl_seconds: 60 } });
  await app.inject({ method: 'POST', url: '/internal/chaos', headers: auth, payload: { peer: 'juan', latency_ms: 400, ttl_seconds: 60 } });

  const soloAngel = await app.inject({ method: 'DELETE', url: '/internal/chaos/angel', headers: auth });
  assert.equal(soloAngel.json().eliminados, 1);
  const todos = await app.inject({ method: 'DELETE', url: '/internal/chaos', headers: auth });
  assert.equal(todos.json().eliminados, 1);

  const startedAt = Date.now();
  const flujo = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  assert.equal(flujo.statusCode, 200);
  assert.ok(Date.now() - startedAt < 400);
  const metrics = await app.inject({ method: 'GET', url: '/metrics' });
  assert.match(metrics.body, /chaos_fault_active\{peer="angel",type="latencia"\} 0/);
});

test('Chaos: el cuerpo se valida (peer desconocido, TTL fuera de rango, sin fallo)', async () => {
  enable();
  const app = await build();

  const peer = await app.inject({ method: 'POST', url: '/internal/chaos', headers: auth, payload: { peer: 'otro', latency_ms: 10, ttl_seconds: 10 } });
  const ttl = await app.inject({ method: 'POST', url: '/internal/chaos', headers: auth, payload: { peer: 'angel', latency_ms: 10, ttl_seconds: 9999 } });
  const vacio = await app.inject({ method: 'POST', url: '/internal/chaos', headers: auth, payload: { peer: 'angel', ttl_seconds: 10 } });
  const latencia = await app.inject({ method: 'POST', url: '/internal/chaos', headers: auth, payload: { peer: 'angel', latency_ms: 60000, ttl_seconds: 10 } });

  assert.equal(peer.statusCode, 400);
  assert.equal(ttl.statusCode, 400);
  assert.equal(vacio.statusCode, 400);
  assert.equal(latencia.statusCode, 400);
});

test('Chaos: la latencia inyectada también se corta con el timeout de la ronda 1', async () => {
  enable();
  process.env.RESILIENCE_ENABLED = 'true';
  const app = await build({ resilience: { timeoutMs: 150, breaker: { volumeThreshold: 100 } } });
  const image = await createImage();
  await app.inject({ method: 'POST', url: '/internal/chaos', headers: auth, payload: { peer: 'angel', latency_ms: 2000, ttl_seconds: 60 } });

  const startedAt = Date.now();
  const flujo = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  const elapsed = Date.now() - startedAt;

  assert.equal(flujo.statusCode, 200);
  assert.equal(flujo.json().dependencias.angel.estado, 'timeout');
  assert.ok(elapsed < 1000, `el flujo tardó ${elapsed} ms`);
  assert.equal(angel.state.requests.length, 0, 'la llamada se abortó antes de salir');
});
