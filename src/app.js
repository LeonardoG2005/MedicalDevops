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

async function buildApp() {
  const app = Fastify({ logger: false });

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
      ],
    },
  });

  await app.register(swaggerUi, { routePrefix: '/documentation' });
  app.addHttpMethod('QUERY', { hasBody: true, overrideExisting: true });

  app.get('/health', {
    schema: {
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
          },
        },
      },
    },
  }, async () => ({ status: 'ok' }));

  await app.register(imagenesRoutes);
  await app.register(notasMedicasRoutes);
  await app.register(documentosGeneradosRoutes);

  return app;
}

module.exports = { buildApp };
