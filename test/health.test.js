const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');

test('GET /health devuelve status ok', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
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
