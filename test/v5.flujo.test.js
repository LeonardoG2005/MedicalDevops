const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');
const { resetDatabase, createImage } = require('./helpers');
const { startPeerMock } = require('../chaos/mocks/peer-mock');

// Round 0 behaviour: the flow with no protections (RESILIENCE_ENABLED unset)
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
  angel.reset(); angel.setDelay(0); angel.setFail(false);
  juan.reset(); juan.setDelay(0); juan.setFail(false);
  delete process.env.RESILIENCE_ENABLED;
});

const buildRound0 = () => buildApp({ chaos: { cacheTtlMs: 0 } });

test('V5: el flujo devuelve imagen, animal y vuelo con el trace id recibido', async () => {
  const app = await buildRound0();
  const image = await createImage();

  const response = await app.inject({
    method: 'GET',
    url: `/api/v5/flujo/${image.id}`,
    headers: { 'x-trace-id': 'demo-trace-0001' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-trace-id'], 'demo-trace-0001');
  assert.equal(response.headers['x-ronda'], '0');
  const body = response.json();
  assert.equal(body.traceId, 'demo-trace-0001');
  assert.equal(body.ronda, '0');
  assert.equal(body.degradado, false);
  assert.equal(body.imagen.id, image.id);
  assert.equal(body.animal.data.nombre, 'Firulais');
  assert.equal(body.vuelo.numero, 'V-050');
  assert.equal(body.dependencias.angel.estado, 'ok');
  assert.equal(body.dependencias.juan.estado, 'ok');
});

test('V5: el trace id se propaga a los dos compañeros y las llamadas van en cadena', async () => {
  const app = await buildRound0();
  const image = await createImage();
  angel.setDelay(150);

  await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}`, headers: { 'x-trace-id': 'cadena-1234' } });

  assert.equal(angel.state.requests.length, 1);
  assert.equal(juan.state.requests.length, 1);
  assert.equal(angel.state.requests[0].traceId, 'cadena-1234');
  assert.equal(juan.state.requests[0].traceId, 'cadena-1234');
  // Sequential: Juan is called only after Angel answered
  assert.ok(juan.state.requests[0].at >= angel.state.requests[0].respondedAt);
});

test('V5: sin X-Trace-Id se genera un UUID y uno inválido se reemplaza', async () => {
  const app = await buildRound0();
  const image = await createImage();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  const sinHeader = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  assert.match(sinHeader.headers['x-trace-id'], uuid);

  const invalido = await app.inject({
    method: 'GET',
    url: `/api/v5/flujo/${image.id}`,
    headers: { 'x-trace-id': 'no válido <script>' },
  });
  assert.match(invalido.headers['x-trace-id'], uuid);
  assert.equal(angel.state.requests.at(-1).traceId, invalido.headers['x-trace-id']);
});

test('V5: imagen inexistente responde 404 con el trace id', async () => {
  const app = await buildRound0();

  const response = await app.inject({ method: 'GET', url: '/api/v5/flujo/999', headers: { 'x-trace-id': 'trace-404-0001' } });

  assert.equal(response.statusCode, 404);
  assert.equal(response.headers['x-trace-id'], 'trace-404-0001');
  assert.equal(response.json().traceId, 'trace-404-0001');
  assert.equal(angel.state.requests.length, 0);
});

test('V5 ronda 0: si Angel falla el flujo responde 502 y no llama a Juan', async () => {
  const app = await buildRound0();
  const image = await createImage();
  angel.setFail(true);

  const response = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });

  assert.equal(response.statusCode, 502);
  const body = response.json();
  assert.equal(body.ronda, '0');
  assert.equal(body.dependencias.angel.estado, 'error');
  assert.equal(body.dependencias.juan, undefined);
  assert.equal(juan.state.requests.length, 0);

  const metrics = await app.inject({ method: 'GET', url: '/metrics' });
  assert.match(metrics.body, /flow_requests_total\{outcome="error"[^}]*round="0"[^}]*\} 1/);
  assert.match(metrics.body, /dependency_request_duration_seconds_count\{peer="angel",outcome="error"/);
});

test('V5 ronda 0: una latencia en Angel se suma entera al flujo', async () => {
  const app = await buildRound0();
  const image = await createImage();
  angel.setDelay(400);

  const startedAt = Date.now();
  const response = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  const elapsed = Date.now() - startedAt;

  assert.equal(response.statusCode, 200);
  assert.ok(elapsed >= 400, `el flujo tardó ${elapsed} ms`);
  assert.ok(response.json().dependencias.angel.duracion_ms >= 400);
});

test('V5: /api/v5/flujo/random escoge una imagen existente', async () => {
  const app = await buildRound0();
  await createImage({ nombre: 'a.jpg' });
  await createImage({ nombre: 'b.jpg' });

  const response = await app.inject({ method: 'GET', url: '/api/v5/flujo/random' });

  assert.equal(response.statusCode, 200);
  assert.ok(['a.jpg', 'b.jpg'].includes(response.json().imagen.nombre));
});

test('V5: /api/v5/flujo/random sin imágenes responde 404', async () => {
  const app = await buildRound0();

  const response = await app.inject({ method: 'GET', url: '/api/v5/flujo/random' });

  assert.equal(response.statusCode, 404);
});
