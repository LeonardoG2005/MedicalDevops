const test = require('node:test');
const assert = require('node:assert/strict');
const { buildServer } = require('../src/server');

test('GET /metrics exposes HTTP and orchestration metrics', async (t) => {
  const { server } = buildServer({
    logger: false,
    publisher: { publish: async () => 'metrics-message' },
  });
  t.after(() => server.close());

  await server.inject({ method: 'GET', url: '/health' });
  await server.inject({ method: 'POST', url: '/api/v2/flujo', payload: { resource: 'imagen' } });
  const response = await server.inject({ method: 'GET', url: '/metrics' });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /http_requests_total/);
  assert.match(response.body, /orchestrator_flows_total/);
  assert.match(response.body, /orchestrator_flow_duration_seconds/);
});