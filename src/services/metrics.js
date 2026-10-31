const {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
  prometheusContentType,
} = require('@prometheus-io/client');
const { getRuntimeInfo } = require('../version');
const { PRIORIDADES } = require('../v3/schemas');

// Notes are created through the v1 route (stable and canary) and the v3 route (canary only)
const NOTE_ROUTES = new Set(['/notas-medicas', '/api/v3/notas-medicas']);

const createMetrics = () => {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const requestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests handled by Medical API',
    labelNames: ['method', 'route', 'status_code', 'version', 'track'],
    registers: [registry],
  });
  const requestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code', 'version', 'track'],
    registers: [registry],
  });
  const notesRegistered = new Counter({
    name: 'medical_notes_registered_total',
    help: 'Attempts to register a medical note, by result',
    labelNames: ['resultado', 'prioridad', 'version', 'track'],
    registers: [registry],
  });

  const recordNote = (request, reply, runtime) => {
    const resultado = reply.statusCode === 201 ? 'registrada' : 'rechazada';
    // Client input never becomes a label value as is: that would create one
    // series per typo
    const raw = request.body?.prioridad;
    const prioridad = PRIORIDADES.includes(raw) ? raw : (raw ? 'invalida' : 'sin_prioridad');
    notesRegistered.inc({ resultado, prioridad, ...runtime });
    // Cloud Logging turns this line into the log-based business metric
    request.log.info({ evento: 'nota_medica_registrada', resultado, prioridad, ...runtime });
  };

  return {
    registerRequestHooks: (app) => {
      app.addHook('onRequest', async (request) => {
        request.metricsStartedAt = process.hrtime.bigint();
      });
      app.addHook('onResponse', async (request, reply) => {
        if (request.url === '/metrics') {
          return;
        }
        const route = request.routeOptions?.url || 'unknown';
        const runtime = getRuntimeInfo();
        const labels = {
          method: request.method,
          route,
          status_code: String(reply.statusCode),
          ...runtime,
        };
        requestsTotal.inc(labels);
        const elapsedSeconds = Number(process.hrtime.bigint() - request.metricsStartedAt) / 1e9;
        requestDuration.observe(labels, elapsedSeconds);
        if (request.method === 'POST' && NOTE_ROUTES.has(route)) {
          recordNote(request, reply, runtime);
        }
      });
    },
    getMetrics: () => registry.metrics(),
    contentType: prometheusContentType,
  };
};

module.exports = { createMetrics };
