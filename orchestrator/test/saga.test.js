const test = require('node:test');
const assert = require('node:assert/strict');
const { buildServer } = require('../src/server');
const { createSagaRunner } = require('../src/services/saga');

test('Saga completes both external steps with the same trace ID', async () => {
  const calls = [];
  const runSaga = createSagaRunner({
    config: {
      petAdoptionApiUrl: 'https://pets.example.test',
      pssApiUrl: 'https://pss.example.test'
    },
    fetchJson: async (url, traceId) => {
      calls.push({ url, traceId });
      return { ok: true };
    }
  });

  const result = await runSaga({ traceId: 'trace-saga-1', payload: {} });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.steps.map((step) => step.status), ['completed', 'completed']);
  assert.deepEqual(calls.map((call) => call.traceId), ['trace-saga-1', 'trace-saga-1']);
});

test('Pub/Sub push returns 204 only after Saga success', async (t) => {
  const runSaga = async (message) => {
    assert.equal(message.traceId, 'trace-push-1');
    return { traceId: message.traceId, status: 'completed', steps: [] };
  };
  const { server } = buildServer({
    logger: false,
    runSaga,
    publisher: { publish: async () => 'message-id' }
  });
  t.after(() => server.close());

  const data = Buffer.from(JSON.stringify({ traceId: 'trace-push-1' })).toString('base64');
  const response = await server.inject({
    method: 'POST',
    url: '/internal/pubsub',
    payload: { message: { data } }
  });

  assert.equal(response.statusCode, 204);
});

test('Pub/Sub push returns 500 so Pub/Sub retries failed Saga messages', async (t) => {
  const { server } = buildServer({
    logger: false,
    runSaga: async () => { throw new Error('dependency unavailable'); },
    publisher: { publish: async () => 'message-id' }
  });
  t.after(() => server.close());

  const data = Buffer.from(JSON.stringify({ traceId: 'trace-push-2' })).toString('base64');
  const response = await server.inject({
    method: 'POST',
    url: '/internal/pubsub',
    payload: { message: { data } }
  });

  assert.equal(response.statusCode, 500);
});