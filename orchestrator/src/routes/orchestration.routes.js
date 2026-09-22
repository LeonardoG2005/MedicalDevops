const crypto = require('node:crypto');
const { getJson } = require('../services/api-client');

const orchestrationRoutes = async (server, options) => {
  const config = options.config;
  const getTraceId = (request) => request.headers['x-trace-id'] || request.headers.traceparent || crypto.randomUUID();

  const fetchExternalCollections = async (config, traceId, paths) => {
    const [petAdoption, pss] = await Promise.all([
      Promise.all(paths.petAdoption.map((path) => getJson(`${config.petAdoptionApiUrl}${path}`, traceId))),
      Promise.all(paths.pss.map((path) => getJson(`${config.pssApiUrl}${path}`, traceId)))
    ]);

    return {
      petAdoption,
      pss
    };
  };

  const registerCompositionRoute = (url, paths) => server.get(url, async (request, reply) => {
    const traceId = getTraceId(request);

    try {
      const external = await fetchExternalCollections(config, traceId, paths);
      return reply.header('X-Trace-Id', traceId).send({
        sources: {
          petAdoption: external.petAdoption,
          pss: external.pss
        }
      });
    } catch (error) {
      return reply.code(error.status === 404 ? 404 : 502).send({
        error: 'External dependency error',
        message: error.message,
        traceId
      });
    }
  });

  registerCompositionRoute('/orchestrate/imagen/:id', {
    petAdoption: ['/api/v2/animals'],
    pss: ['/api/v2/entidades/vuelos']
  });

  registerCompositionRoute('/orchestrate/nota-medica/:id', {
    petAdoption: ['/api/v2/adoptantes'],
    pss: ['/pasajeros']
  });

  registerCompositionRoute('/orchestrate/documento-generado/:id', {
    petAdoption: ['/api/v2/adopciones'],
    pss: ['/asientos-asignados']
  });

  server.get('/orchestrate/:id', async (request, reply) => {
    return reply.code(501).send({
      error: 'Not Implemented',
      message: 'The integration contract is still pending'
    });
  });
};

module.exports = orchestrationRoutes;