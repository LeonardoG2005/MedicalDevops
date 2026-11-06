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
const v3Routes = require('./v3/routes');
const { createMetrics } = require('./services/metrics');
const { getRuntimeInfo, registerVersionHeaders } = require('./version');
const { registerFaultInjection } = require('./fault-injection');

async function buildApp(options = {}) {
  const app = Fastify({ logger: true });
  const metrics = options.metrics || createMetrics();
  registerVersionHeaders(app);
  registerFaultInjection(app);
  metrics.registerRequestHooks(app);

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
        version: '1.0.0',
        description: 'API académica para imágenes, notas médicas y documentos generados.',
      },
      servers: [{url: '/', description: 'Current API server'}],
      tags: [
        { name: 'Health', description: 'Health checks' },
        { name: 'Imagenes', description: 'Gestión de imágenes' },
        { name: 'NotasMedicas', description: 'Gestión de notas médicas' },
        { name: 'DocumentosGenerados', description: 'Gestión de documentos generados' },
        { name: 'V3', description: 'Notas con prioridad clínica y resumen por imagen (canary)' },
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
  await app.register(v3Routes);

  return app;
}

module.exports = { buildApp };
