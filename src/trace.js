const crypto = require('node:crypto');

const TRACE_HEADER = 'x-trace-id';
// Only plain ids are accepted from the outside: anything else is replaced so a
// client can never inject arbitrary text into the logs or the peers' headers
const TRACE_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

function isValidTraceId(value) {
  return typeof value === 'string' && TRACE_ID_PATTERN.test(value);
}

// Fastify calls this once per request with the raw Node request, so the
// request id (and therefore the "traceId" field of every log line) is the
// trace id that came in, or a new one when the caller sent none
function genReqId(req) {
  const incoming = req.headers[TRACE_HEADER];
  return isValidTraceId(incoming) ? incoming : crypto.randomUUID();
}

// Every response carries the id back, whichever route handled the request
function registerTraceHeader(app) {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Trace-Id', request.id);
  });
}

module.exports = { TRACE_HEADER, isValidTraceId, genReqId, registerTraceHeader };
