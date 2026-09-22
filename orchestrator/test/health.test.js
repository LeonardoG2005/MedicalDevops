const test = require('node:test');
const assert = require('node:assert/strict');
const { buildServer } = require('../src/server');

test('GET /health returns status ok', async (t) => {
  const { server } = buildServer({ logger: false });
  t.after(() => server.close());

  const response = await server.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
});