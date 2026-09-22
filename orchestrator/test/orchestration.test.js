const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { buildServer } = require('../src/server');

const startExternalApi = async () => {
  const traceIds = [];
  const externalApi = http.createServer((request, response) => {
    traceIds.push(request.headers['x-trace-id']);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ path: request.url, owner: 'external-service' }));
  });

  await new Promise((resolve) => externalApi.listen(0, '127.0.0.1', resolve));
  return { externalApi, traceIds, url: `http://127.0.0.1:${externalApi.address().port}` };
};

test('composition route returns separately labeled external sources', async (t) => {
  const external = await startExternalApi();
  const { server } = buildServer({
    logger: false,
    config: {
      petAdoptionApiUrl: external.url,
      pssApiUrl: external.url
    }
  });
  t.after(async () => {
    await server.close();
    await new Promise((resolve) => external.externalApi.close(resolve));
  });

  const response = await server.inject({
    method: 'GET',
    url: '/orchestrate/imagen/10',
    headers: { 'x-trace-id': 'trace-123' }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-trace-id'], 'trace-123');
  assert.equal(response.json().sources.petAdoption[0].owner, 'external-service');
  assert.equal(response.json().sources.pss[0].owner, 'external-service');
  assert.deepEqual(external.traceIds, ['trace-123', 'trace-123']);
});

test('composition route maps external HTTP errors to controlled responses', async (t) => {
  const externalApi = http.createServer((request, response) => {
    response.writeHead(503);
    response.end();
  });
  await new Promise((resolve) => externalApi.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${externalApi.address().port}`;
  const { server } = buildServer({
    logger: false,
    config: { petAdoptionApiUrl: url, pssApiUrl: url }
  });
  t.after(async () => {
    await server.close();
    await new Promise((resolve) => externalApi.close(resolve));
  });

  const response = await server.inject({ method: 'GET', url: '/orchestrate/imagen/10' });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, 'External dependency error');
});