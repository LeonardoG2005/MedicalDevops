const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');

test('GET /health devuelve status ok', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
});
