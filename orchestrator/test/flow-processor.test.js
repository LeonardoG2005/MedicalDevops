const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createFlowProcessor } = require('../src/services/flow-processor');

const startApi = async (respond) => {
  const calls = [];
  const server = http.createServer((request, response) => {
    calls.push({ url: request.url, traceId: request.headers['x-trace-id'] });
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(respond(request.url, body)));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, calls, url: `http://127.0.0.1:${server.address().port}` };
};

test('flow processor calls Medical (local), API A, API C, and posts the result to API A', async (t) => {
  const medical = await startApi((url) => ({ id: 5, nombre: 'imagen-local', url }));
  const apiA = await startApi((url) => (url.includes('/mensaje') ? { stored: true } : { id: 1, vuelo: 'AV123' }));
  const apiC = await startApi(() => ({ id: 2, nombre: 'Firulais' }));

  t.after(async () => {
    await Promise.all([medical, apiA, apiC].map((s) => new Promise((resolve) => s.server.close(resolve))));
  });

  const processFlow = createFlowProcessor({
    config: { medicalApiUrl: medical.url, apiAUrl: apiA.url, apiCUrl: apiC.url },
  });

  const result = await processFlow({ traceId: 'trace-flow-x', payload: { resource: 'imagen', id: 5 } });

  assert.equal(result.status, 'completed');
  assert.equal(result.entities.medical.id, 5);
  assert.equal(result.entities.apiA.vuelo, 'AV123');
  assert.equal(result.entities.apiC.nombre, 'Firulais');

  assert.equal(medical.calls[0].url, '/imagenes/5');
  assert.ok(apiA.calls.some((c) => c.url === '/api/v2/mensaje'));
  assert.ok(medical.calls.every((c) => c.traceId === 'trace-flow-x'));
});

test('flow processor rejects a payload without resource=imagen and id', async () => {
  const processFlow = createFlowProcessor({ config: {} });
  await assert.rejects(
    processFlow({ traceId: 'trace-x', payload: {} }),
    /Invalid flow payload/,
  );
});