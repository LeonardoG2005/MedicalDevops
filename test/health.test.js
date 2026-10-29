const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');

test('GET /health devuelve status ok con versión y track', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, 'ok');
  assert.equal(response.json().track, 'stable');
  assert.equal(response.json().version, response.headers['x-app-version']);
});

test('Todas las respuestas, incluidos los 404, indican versión y track', async (t) => {
  process.env.APP_VERSION = '9.9.9';
  process.env.TRACK = 'canary';
  t.after(() => {
    delete process.env.APP_VERSION;
    delete process.env.TRACK;
  });
  const app = await buildApp();

  for (const url of ['/', '/health', '/no-existe']) {
    const response = await app.inject({ method: 'GET', url });
    assert.equal(response.headers['x-app-version'], '9.9.9');
    assert.equal(response.headers['x-track'], 'canary');
  }
});

test('Un TRACK desconocido se trata como stable', async (t) => {
  process.env.TRACK = 'beta';
  t.after(() => delete process.env.TRACK);
  const app = await buildApp();

  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.headers['x-track'], 'stable');
});

test('GET / devuelve información de bienvenida y enlaces útiles', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    service: 'Medical Documents API',
    message: 'API funcionando correctamente',
    health: '/health',
    documentation: '/documentation',
  });
});

test('GET /metrics exposes Prometheus HTTP metrics', async () => {
  const app = await buildApp();
  await app.inject({ method: 'GET', url: '/health' });

  const response = await app.inject({ method: 'GET', url: '/metrics' });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /text\/plain/);
  assert.match(response.body, /http_requests_total/);
  assert.match(response.body, /http_request_duration_seconds/);
});
