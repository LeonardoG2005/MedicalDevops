// OpenTelemetry hacia Grafana Cloud (tablero del grupo). Se carga primero en server.js.
// Solo se activa si OTEL_EXPORTER_OTLP_ENDPOINT está definido; sin esa variable no hace nada.
const os = require('os');
const { randomUUID } = require('crypto');

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // Evita que la instrumentación HTTP emita su propio http.server.duration y choque con el de otel-metrics.
  process.env.OTEL_SEMCONV_STABILITY_OPT_IN = process.env.OTEL_SEMCONV_STABILITY_OPT_IN || 'http';

  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { resourceFromAttributes } = require('@opentelemetry/resources');

  const sdk = new NodeSDK({
    // Sin un id por réplica, los contadores de los pods se mezclan en una sola serie.
    resource: resourceFromAttributes({
      'service.instance.id': process.env.HOSTNAME || `${os.hostname()}-${randomUUID().slice(0, 8)}`,
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 15000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false }
      }),
    ],
  });
  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
