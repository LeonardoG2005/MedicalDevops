const http = require('http');

if (!http.METHODS.includes('QUERY')) {
  http.METHODS.push('QUERY');
}

const Fastify = require('fastify');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');

const imagenesRoutes = require('./routes/images.routes');
const notasMedicasRoutes = require('./routes/medical-notes.routes');
const documentosGeneradosRoutes = require('./routes/generated-documents.routes');
const v2Routes = require('./v2/routes');
const v4Routes = require('./v4/routes');
const v5Routes = require('./v5/routes');
const { chaosRoutes } = require('./chaos/routes');
const { createChaosRepository, createFaultCache } = require('./chaos/repository');
const { createDependencyCaller } = require('./v5/resilience');
const { resilienceConfig } = require('./v5/config');
const { createFlowArchive } = require('./v5/archivo');
const { createMetrics } = require('./services/metrics');
const { getRuntimeInfo, registerVersionHeaders } = require('./version');
const { registerFaultInjection } = require('./fault-injection');
const { genReqId, registerTraceHeader } = require('./trace');

async function buildApp(options = {}) {
  // The request id IS the trace id: it comes from X-Trace-Id when the caller
  // sends one, every log line carries it as "traceId", and it goes back in the
  // response header and on to the peers
  const app = Fastify({ logger: true, genReqId, requestIdLogLabel: 'traceId' });
  const metrics = options.metrics || createMetrics();
  registerVersionHeaders(app);
  registerTraceHeader(app);
  // Metrics first: an injected 500 must be timed and counted like a real one
  metrics.registerRequestHooks(app);
  registerFaultInjection(app);

  app.setErrorHandler((error, request, reply) => {
    if (error.code === '23503') {
      return reply.status(400).send({ error: 'Bad Request', message: 'La referencia indicada no existe (FK inválida).' });
    }
    if (error.validation) {
      return reply.status(400).send({ error: 'Bad Request', message: error.message });
    }
    request.log.error(error);
    reply.status(500).send({ error: 'Internal Server Error' });
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Medical Documents API',
        version: require('../package.json').version,
        description: 'API académica para imágenes, notas médicas y documentos generados.',
      },
      servers: [{url: '/', description: 'Current API server'}],
      tags: [
        { name: 'Health', description: 'Health checks' },
        { name: 'Imagenes', description: 'Gestión de imágenes' },
        { name: 'NotasMedicas', description: 'Gestión de notas médicas' },
        { name: 'DocumentosGenerados', description: 'Gestión de documentos generados' },
        { name: 'V4', description: 'Notas con prioridad clínica y resumen por imagen (canary)' },
        { name: 'V5', description: 'Flujo multicloud en cadena con trace id (Ingeniería del Caos)' },
      ],
    },
  });

  await app.register(swaggerUi, { routePrefix: '/documentation' });
  app.addHttpMethod('QUERY', { hasBody: true, overrideExisting: true });

  app.get('/metrics', async (request, reply) => {
    reply.type(metrics.contentType);
    return metrics.getMetrics();
  });

  app.get('/', {
    schema: {
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            service: { type: 'string' },
            message: { type: 'string' },
            health: { type: 'string' },
            documentation: { type: 'string' },
          },
          required: ['service', 'message', 'health', 'documentation'],
        },
      },
    },
  }, async () => ({
    service: 'Medical Documents API',
    message: 'API funcionando correctamente',
    health: '/health',
    documentation: '/documentation',
  }));

  app.get('/health', {
    logLevel: 'silent',
    schema: {
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            version: { type: 'string' },
            track: { type: 'string' },
          },
        },
      },
    },
  }, async () => ({ status: 'ok', ...getRuntimeInfo() }));

  await app.register(imagenesRoutes);
  await app.register(notasMedicasRoutes);
  await app.register(documentosGeneradosRoutes);
  await app.register(v2Routes);
  await app.register(v4Routes);

  // v5: the chaos switch (DB table read through a short cache) and the
  // dependency caller (timeout + breaker when RESILIENCE_ENABLED=true) are
  // built once per app so tests can inject their own thresholds
  const chaosRepository = options.chaosRepository || createChaosRepository();
  const faults = createFaultCache({
    repository: chaosRepository,
    ttlMs: options.chaos?.cacheTtlMs ?? 3000,
    // Background refresh so idle pods drop a removed fault from their gauge.
    // Opt in through CHAOS_CACHE_REFRESH_MS (set in the ConfigMap); off by
    // default so short lived processes (tests, scripts) can exit
    refreshEveryMs: options.chaos?.refreshEveryMs ?? Number(process.env.CHAOS_CACHE_REFRESH_MS || 0),
    metrics,
    log: app.log,
  });
  app.addHook('onClose', async () => faults.stop());
  const caller = createDependencyCaller({ ...resilienceConfig(options.resilience), metrics });
  const archivo = options.flowArchive || createFlowArchive({ log: app.log });
  await app.register(v5Routes, { caller, faults, metrics, archivo });
  await app.register(chaosRoutes, { repository: chaosRepository, cache: faults });

  return app;
}

module.exports = { buildApp };
