// Métricas RED con los mismos nombres que usa el tablero del grupo en Grafana.
// Si src/telemetry.js no arrancó el SDK, el meter es no-op y esto no hace nada.
const { metrics } = require('@opentelemetry/api');

const meter = metrics.getMeter('medical-documents-api');
const requests = meter.createCounter('http.server.requests');
const duration = meter.createHistogram('http.server.duration', { unit: 'ms' });

const recordHttpRequest = (method, route, statusCode, elapsedMs) => {
  const attributes = {
    'http.method': method,
    'http.route': route,
    'http.status_code': statusCode,
  };
  requests.add(1, attributes);
  duration.record(elapsedMs, attributes);
};

module.exports = { recordHttpRequest };
