const {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
  prometheusContentType,
} = require('@prometheus-io/client');
const { recordHttpRequest } = require('./otel-metrics');

const createMetrics = () => {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const requestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests handled by Medical API',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });
  const requestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });

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
        const labels = {
          method: request.method,
          route,
          status_code: String(reply.statusCode),
        };
        requestsTotal.inc(labels);
        const elapsedSeconds = Number(process.hrtime.bigint() - request.metricsStartedAt) / 1e9;
        requestDuration.observe(labels, elapsedSeconds);
        recordHttpRequest(request.method, request.routeOptions?.url || 'sin_ruta', reply.statusCode, elapsedSeconds * 1000);
      });
    },
    getMetrics: () => registry.metrics(),
    contentType: prometheusContentType,
  };
};

module.exports = { createMetrics };