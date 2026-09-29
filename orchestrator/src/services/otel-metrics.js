// Métricas del orquestador y de la cola con los nombres que usa el tablero del grupo en Grafana.
// Si src/telemetry.js no arrancó el SDK, el meter es no-op y esto no hace nada.
const { metrics } = require('@opentelemetry/api');

const meter = metrics.getMeter('medical-orchestrator');
const requests = meter.createCounter('http.server.requests');
const duration = meter.createHistogram('http.server.duration', { unit: 'ms' });
const reprocessed = meter.createCounter('queue.messages.reprocessed');
// Sube al publicar en Pub/Sub y baja cuando el push se procesa bien; la suma entre instancias es lo pendiente.
const pending = meter.createUpDownCounter('queue.messages.pending');

module.exports = {
  recordHttpRequest: (method, route, statusCode, elapsedMs) => {
    const attributes = { 'http.method': method, 'http.route': route, 'http.status_code': statusCode };
    requests.add(1, attributes);
    duration.record(elapsedMs, attributes);
  },
  queuePublished: () => pending.add(1),
  queueProcessed: () => pending.add(-1),
  queueReprocessed: () => reprocessed.add(1),
};
