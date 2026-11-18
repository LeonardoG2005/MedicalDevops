const { metrics } = require('@opentelemetry/api');
const { version } = require('../../package.json');

// Mirror of the experiment instruments on the OpenTelemetry meter. When the
// SDK is loaded (GKE: --require auto-instrumentations + OTLP to Grafana Cloud)
// these reach Grafana next to the auto-instrumented http metrics and traces.
// Without the SDK (tests, local dev) the API returns no-op instruments, so the
// Prometheus registry in metrics.js stays the only source and nothing breaks.
const meter = metrics.getMeter('medical-api', version);

// Same edges as the Prometheus histograms (metrics.js). Without this advice
// the SDK uses its default boundaries, which are meant for milliseconds
// (0, 5, 10, 25...): every duration in seconds fell in the first bucket and
// Grafana showed a flat p95 of 4.75 s (0.95 x 5) in every round
const LATENCY_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.25, 3.5, 4, 5, 7.5, 10];
const enSegundos = { explicitBucketBoundaries: LATENCY_BUCKETS };

// The HTTP pair mirrors the Prometheus http_* series with the same labels
// (route, status_code, round...), so Grafana can split the flow by round
const httpRequests = meter.createCounter('http_requests', {
  description: 'Total HTTP requests handled by Medical API',
});
const httpRequestDuration = meter.createHistogram('http_request_duration', {
  description: 'HTTP request duration in seconds',
  unit: 's',
  advice: enSegundos,
});
const dependencyDuration = meter.createHistogram('dependency_request_duration', {
  description: 'Duration of outgoing calls to the peer APIs, in seconds',
  unit: 's',
  advice: enSegundos,
});
const flowRequests = meter.createCounter('flow_requests', {
  description: 'Executions of the v5 flow by outcome',
});
const chaosFaultActive = meter.createGauge('chaos_fault_active', {
  description: '1 while a fault from the chaos switch is active for the peer',
});
const circuitBreakerState = meter.createGauge('circuit_breaker_state', {
  description: 'Circuit breaker state per peer: 0 closed, 1 open, 2 half open',
});

module.exports = {
  LATENCY_BUCKETS,
  httpRequests,
  httpRequestDuration,
  dependencyDuration,
  flowRequests,
  chaosFaultActive,
  circuitBreakerState,
};
