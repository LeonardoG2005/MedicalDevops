const FAULT_HEADER = 'x-fault';
// Caps the requested delay so a malformed header cannot hang a request for minutes
const MAX_LATENCY_MS = 5000;

// "error=0.5;latency=800" -> { errorRate: 0.5, latencyMs: 800 }. Anything that
// does not parse is ignored, so a stray header never takes the service down.
function parseFault(value) {
  let errorRate = 0;
  let latencyMs = 0;
  for (const part of value.split(';')) {
    const [name, raw] = part.split('=');
    const number = Number(raw);
    if (Number.isNaN(number)) continue;
    if (name.trim() === 'error') errorRate = Math.min(Math.max(number, 0), 1);
    if (name.trim() === 'latency') latencyMs = Math.min(Math.max(number, 0), MAX_LATENCY_MS);
  }
  return { errorRate, latencyMs };
}

// Simulates a regression on the canary without touching the stable code: only
// registered when FAULT_INJECTION=true, which is only set on the canary
// revision. /health and /metrics are skipped so platform health checks are
// never confused with an injected failure.
function registerFaultInjection(app) {
  if (process.env.FAULT_INJECTION !== 'true') {
    return;
  }

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) {
      return;
    }
    const value = request.headers[FAULT_HEADER];
    if (!value) {
      return;
    }
    const { errorRate, latencyMs } = parseFault(value);
    if (latencyMs) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }
    if (errorRate && Math.random() < errorRate) {
      request.log.warn({ evento: 'fallo_inyectado', ruta: request.url });
      reply.code(500).send({ error: 'Fallo inyectado' });
    }
  });
}

module.exports = { parseFault, registerFaultInjection };
