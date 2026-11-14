#!/usr/bin/env node
// Stand-in for the teammates' APIs, used by the automated tests and by the
// local rounds of the experiment when the real APIs (AWS and OCI) are not up.
// It answers the two endpoints the coordinator calls, echoes X-Trace-Id like
// Angel's traceId middleware does, and records what it received so a test can
// assert the propagation and the order of the calls.
//
//   node chaos/mocks/peer-mock.js [puerto] [nombre]
//   MOCK_DELAY_MS=3000 MOCK_FAIL=1 node chaos/mocks/peer-mock.js 4101 angel
const http = require('node:http');

const RESPUESTAS = {
  '/api/v2/animals/random': () => ({
    data: { id: 80, nombre: 'Firulais', especie: 'perro', edad: 3, estado: 'disponible' },
  }),
  '/api/v2/entidades/vuelos/random': () => ({
    id: 50, numero: 'V-050', origen: 'BOG', destino: 'MDE', fecha: '2026-11-18',
  }),
  '/health': () => ({ status: 'ok', mock: true }),
  '/api/health': () => ({ status: 'ok', mock: true }),
};

function startPeerMock({ port = 0, name = 'peer', delayMs = 0, fail = false } = {}) {
  const state = { name, delayMs, fail, requests: [] };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://mock');
    const traceId = req.headers['x-trace-id'] || null;
    const recibido = { path: url.pathname, traceId, traceparent: req.headers.traceparent || null, at: Date.now() };
    state.requests.push(recibido);

    const responder = () => {
      recibido.respondedAt = Date.now();
      if (traceId) res.setHeader('X-Trace-Id', traceId);
      res.setHeader('Content-Type', 'application/json');
      const build = RESPUESTAS[url.pathname];
      if (!build) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: 'no encontrado', traceId }));
      }
      if (state.fail && url.pathname.startsWith('/api/v2')) {
        res.statusCode = 503;
        return res.end(JSON.stringify({ error: 'fallo simulado', traceId }));
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ ...build(), traceId }));
    };

    if (state.delayMs > 0 && url.pathname.startsWith('/api/v2')) {
      setTimeout(responder, state.delayMs);
    } else {
      responder();
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: boundPort } = server.address();
      resolve({
        url: `http://127.0.0.1:${boundPort}`,
        port: boundPort,
        state,
        setDelay: (ms) => { state.delayMs = ms; },
        setFail: (value) => { state.fail = value; },
        reset: () => { state.requests.length = 0; },
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

if (require.main === module) {
  const port = Number(process.argv[2] || 4101);
  const name = process.argv[3] || 'peer';
  startPeerMock({
    port,
    name,
    delayMs: Number(process.env.MOCK_DELAY_MS || 0),
    fail: process.env.MOCK_FAIL === '1',
  }).then((mock) => {
    console.log(`[peer-mock:${name}] escuchando en ${mock.url} (delay=${mock.state.delayMs}ms fail=${mock.state.fail})`);
  });
}

module.exports = { startPeerMock, RESPUESTAS };
