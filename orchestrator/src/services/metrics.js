const {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
  prometheusContentType,
} = require('@prometheus-io/client');

const createMetrics = () => {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  const flows = new Counter({ name: 'orchestrator_flows_total', help: 'Total orchestration flows', labelNames: ['status'], registers: [registry] });
  const flowFailures = new Counter({ name: 'orchestrator_flow_failures_total', help: 'Failed orchestration flows', registers: [registry] });
  const flowDuration = new Histogram({ name: 'orchestrator_flow_duration_seconds', help: 'Orchestration flow duration', registers: [registry] });
  const externalDuration = new Histogram({ name: 'orchestrator_external_request_duration_seconds', help: 'External request duration', labelNames: ['service', 'status'], registers: [registry] });
  const httpRequests = new Counter({ name: 'http_requests_total', help: 'Total Orchestrator HTTP requests', labelNames: ['method', 'route', 'status_code'], registers: [registry] });
  const httpDuration = new Histogram({ name: 'http_request_duration_seconds', help: 'Orchestrator HTTP request duration', labelNames: ['method', 'route', 'status_code'], registers: [registry] });
  const queueReprocessed = new Counter({ name: 'orchestrator_queue_messages_reprocessed_total', help: 'Pub/Sub messages redelivered after a previous failed attempt', registers: [registry] });
  const queuePending = new Gauge({ name: 'orchestrator_queue_messages_pending', help: 'Messages published and not yet completed', registers: [registry] });

  return {
    registerRequestHooks: (server) => {
      server.addHook('onRequest', async (request) => {
        request.metricsStartedAt = process.hrtime.bigint();
      });
      server.addHook('onResponse', async (request, reply) => {
        if (request.url === '/metrics') return;
        const labels = { method: request.method, route: request.routeOptions?.url || 'unknown', status_code: String(reply.statusCode) };
        httpRequests.inc(labels);
        httpDuration.observe(labels, Number(process.hrtime.bigint() - request.metricsStartedAt) / 1e9);
      });
    },
    flowStarted: () => {
      queuePending.inc();
      return process.hrtime.bigint();
    },
    flowCompleted: (startedAt) => {
      flows.inc({ status: 'completed' });
      flowDuration.observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
    },
    flowFailed: (startedAt) => {
      flows.inc({ status: 'failed' });
      flowFailures.inc();
      flowDuration.observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
    },
    flowProcessed: () => queuePending.dec(),
    externalRequest: (service, status, startedAt) => externalDuration.observe({ service, status }, Number(process.hrtime.bigint() - startedAt) / 1e9),
    queueReprocessed: () => queueReprocessed.inc(),
    getMetrics: () => registry.metrics(),
    contentType: prometheusContentType,
  };
};

module.exports = { createMetrics };