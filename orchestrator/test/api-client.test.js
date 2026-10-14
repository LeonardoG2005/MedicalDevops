const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { ExternalApiError, getJson } = require('../src/services/api-client');

const withServer = async (handler, callback) => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

test('GET client forwards X-Trace-Id', async () => {
  await withServer((request, response) => {
    assert.equal(request.headers['x-trace-id'], 'trace-abc');
    assert.equal(request.headers.traceparent, 'trace-abc');
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
  }, async (url) => {
    assert.deepEqual(await getJson(url, 'trace-abc'), { ok: true });
  });
});

test('GET client throws a controlled error for HTTP failures', async () => {
  await withServer((request, response) => {
    response.writeHead(503);
    response.end();
  }, async (url) => {
    await assert.rejects(getJson(url), (error) => {
      assert(error instanceof ExternalApiError);
      assert.equal(error.status, 503);
      return true;
    });
  });
});

test('GET client applies timeout', async () => {
  await withServer(() => {}, async (url) => {
    await assert.rejects(getJson(url, undefined, 10), ExternalApiError);
  });
});