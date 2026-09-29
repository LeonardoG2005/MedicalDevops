const test = require('node:test');
const assert = require('node:assert/strict');
const { buildServer } = require('../src/server');

test('POST /api/v2/flujo publishes a pending flow and preserves trace ID', async (t) => {
  const published = [];
  const { server } = buildServer({
    logger: false,
    publisher: { publish: async (message) => {
      published.push(message);
      return 'message-123';
    } }
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: 'POST',
    url: '/api/v2/flujo',
    headers: { 'x-trace-id': 'trace-flow-1' },
    payload: { resource: 'imagen', id: 12 }
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.headers['x-trace-id'], 'trace-flow-1');
  assert.deepEqual(response.json(), {
    traceId: 'trace-flow-1',
    status: 'pending',
    messageId: 'message-123'
  });
  assert.equal(published[0].traceId, 'trace-flow-1');
  assert.equal(published[0].status, 'pending');
  assert.deepEqual(published[0].payload, { resource: 'imagen', id: 12 });
});

test('POST /api/v2/flujo returns 503 when publishing fails', async (t) => {
  const { server } = buildServer({
    logger: false,
    publisher: { publish: async () => { throw new Error('broker offline'); } }
  });
  t.after(() => server.close());

  const response = await server.inject({ method: 'POST', url: '/api/v2/flujo' });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, 'Message broker unavailable');
  assert.ok(response.json().traceId);
});