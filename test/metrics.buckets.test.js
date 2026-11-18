const test = require('node:test');
const assert = require('node:assert/strict');
const { metrics } = require('@opentelemetry/api');
const { MeterProvider, MetricReader } = require('@opentelemetry/sdk-metrics');

// Minimal pull reader to read what the SDK aggregated, without exporting
class LectorManual extends MetricReader {
  async onForceFlush() {}
  async onShutdown() {}
}

// The global provider must exist before otel-metrics.js creates its meter
const lector = new LectorManual();
metrics.setGlobalMeterProvider(new MeterProvider({ readers: [lector] }));
const otel = require('../src/services/otel-metrics');
const { LATENCY_BUCKETS } = require('../src/services/metrics');

async function limitesDe(nombre) {
  const { resourceMetrics } = await lector.collect();
  const metrica = resourceMetrics.scopeMetrics.flatMap((s) => s.metrics).find((m) => m.descriptor.name === nombre);
  return metrica.dataPoints[0].value.buckets.boundaries;
}

test('Buckets: Prometheus y OTel usan los mismos limites, con bordes en 2 s y 3 s', () => {
  assert.deepEqual(otel.LATENCY_BUCKETS, LATENCY_BUCKETS);
  assert.ok(LATENCY_BUCKETS.includes(2));
  assert.ok(LATENCY_BUCKETS.includes(3));
});

test('Buckets: los histogramas OTel usan limites en segundos, no los de milisegundos del SDK', async () => {
  otel.httpRequestDuration.record(3.1, { route: '/api/v5/flujo/random' });
  otel.dependencyDuration.record(0.2, { peer: 'angel' });

  assert.deepEqual(await limitesDe('http_request_duration'), LATENCY_BUCKETS);
  assert.deepEqual(await limitesDe('dependency_request_duration'), LATENCY_BUCKETS);
});
