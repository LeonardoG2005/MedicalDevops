const {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
  prometheusContentType,
} = require('@prometheus-io/client');
const { getRuntimeInfo } = require('../version');
const { getRound } = require('../v5/config');
const { PRIORIDADES } = require('../v4/schemas');
const otel = require('./otel-metrics');

// Notes are created through the v1 route (stable and canary) and the v4 route (canary only)
const NOTE_ROUTES = new Set(['/notas-medicas', '/api/v4/notas-medicas']);

const PEERS = ['angel', 'juan'];
const FAULT_TYPES = ['latencia', 'error'];
// Buckets with edges at the timeout (2 s) and at the injected latency (3 s),
// so both show up as steps on the dependency histogram
const DEPENDENCY_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 10];
const CIRCUIT_STATES = { closed: 0, open: 1, halfOpen: 2 };

// version, track and round travel on every series so the two rounds of the
// experiment can be compared on the same dashboard
const runtimeLabels = () => ({ ...getRuntimeInfo(), round: getRound() });

const createMetrics = () => {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const requestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests handled by Medical API',
    labelNames: ['method', 'route', 'status_code', 'version', 'track', 'round'],
    registers: [registry],
  });
  const requestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code', 'version', 'track', 'round'],
    registers: [registry],
  });
  const notesRegistered = new Counter({
    name: 'medical_notes_registered_total',
    help: 'Attempts to register a medical note, by result',
    labelNames: ['resultado', 'prioridad', 'version', 'track'],
    registers: [registry],
  });
  const dependencyDuration = new Histogram({
    name: 'dependency_request_duration_seconds',
    help: 'Duration of outgoing calls to the peer APIs, by peer and outcome',
    labelNames: ['peer', 'outcome', 'version', 'track', 'round'],
    buckets: DEPENDENCY_BUCKETS,
    registers: [registry],
  });
  const flowRequests = new Counter({
    name: 'flow_requests_total',
    help: 'Executions of the v5 flow by outcome (ok, degradado, error)',
    labelNames: ['outcome', 'version', 'track', 'round'],
    registers: [registry],
  });
  const chaosFaultActive = new Gauge({
    name: 'chaos_fault_active',
    help: '1 while a fault from the chaos switch is active for the peer',
    labelNames: ['peer', 'type'],
    registers: [registry],
  });
  const circuitState = new Gauge({
    name: 'circuit_breaker_state',
    help: 'Circuit breaker state per peer: 0 closed, 1 open, 2 half open',
    labelNames: ['peer'],
    registers: [registry],
  });
  // Series exist from the first scrape, so the dashboards show 0 instead of "no data"
  for (const peer of PEERS) {
    for (const type of FAULT_TYPES) {
      chaosFaultActive.set({ peer, type }, 0);
      otel.chaosFaultActive.record(0, { peer, type });
    }
    circuitState.set({ peer }, 0);
    // Without this the OTel series only appears after the first breaker event,
    // so the Grafana panel stays empty for the whole of round 0
    otel.circuitBreakerState.record(0, { peer });
  }

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
          round: getRound(),
        };
        requestsTotal.inc(labels);
        const elapsedSeconds = Number(process.hrtime.bigint() - request.metricsStartedAt) / 1e9;
        requestDuration.observe(labels, elapsedSeconds);
        otel.httpRequests.add(1, labels);
        otel.httpRequestDuration.record(elapsedSeconds, labels);
        if (request.method === 'POST' && NOTE_ROUTES.has(route)) {
          recordNote(request, reply, runtime);
        }
      });
    },
    observeDependency: ({ peer, outcome, seconds }) => {
      const labels = { peer, outcome, ...runtimeLabels() };
      dependencyDuration.observe(labels, seconds);
      otel.dependencyDuration.record(seconds, labels);
    },
    countFlow: (outcome) => {
      const labels = { outcome, ...runtimeLabels() };
      flowRequests.inc(labels);
      otel.flowRequests.add(1, labels);
    },
    setFaultActive: (peer, type, active) => {
      const value = active ? 1 : 0;
      chaosFaultActive.set({ peer, type }, value);
      otel.chaosFaultActive.record(value, { peer, type });
    },
    setCircuitState: (peer, state) => {
      const value = CIRCUIT_STATES[state] ?? 0;
      circuitState.set({ peer }, value);
      otel.circuitBreakerState.record(value, { peer });
    },
    getMetrics: () => registry.metrics(),
    contentType: prometheusContentType,
  };
};

module.exports = { createMetrics, PEERS, FAULT_TYPES, CIRCUIT_STATES };
