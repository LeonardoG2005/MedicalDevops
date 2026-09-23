const {
  Counter,
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
  const steps = new Counter({ name: 'orchestrator_step_total', help: 'Saga steps by service and status', labelNames: ['step', 'service', 'status'], registers: [registry] });
  const stepFailures = new Counter({ name: 'orchestrator_step_failures_total', help: 'Failed Saga steps', labelNames: ['step', 'service'], registers: [registry] });
  const externalDuration = new Histogram({ name: 'orchestrator_external_request_duration_seconds', help: 'External request duration', labelNames: ['service', 'status'], registers: [registry] });
  const httpRequests = new Counter({ name: 'http_requests_total', help: 'Total Orchestrator HTTP requests', labelNames: ['method', 'route', 'status_code'], registers: [registry] });
  const httpDuration = new Histogram({ name: 'http_request_duration_seconds', help: 'Orchestrator HTTP request duration', labelNames: ['method', 'route', 'status_code'], registers: [registry] });

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
    flowStarted: () => process.hrtime.bigint(),
    flowCompleted: (startedAt) => {
      flows.inc({ status: 'completed' });
      flowDuration.observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
    },
    flowFailed: (startedAt) => {
      flows.inc({ status: 'failed' });
      flowFailures.inc();
      flowDuration.observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
    },
    stepCompleted: (step) => steps.inc({ step: step.name, service: step.service, status: 'completed' }),
    stepFailed: (step) => {
      steps.inc({ step: step.name, service: step.service, status: 'failed' });
      stepFailures.inc({ step: step.name, service: step.service });
    },
    externalRequest: (service, status, startedAt) => externalDuration.observe({ service, status }, Number(process.hrtime.bigint() - startedAt) / 1e9),
    getMetrics: () => registry.metrics(),
    contentType: prometheusContentType,
  };
};

module.exports = { createMetrics };