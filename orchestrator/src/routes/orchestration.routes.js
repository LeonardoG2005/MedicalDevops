const crypto = require('node:crypto');
const { getJson } = require('../services/api-client');
const { createPubSubPublisher } = require('../services/pubsub-publisher');
const { createSagaRunner } = require('../services/saga');

const orchestrationRoutes = async (server, options) => {
  const config = options.config;
  const publisher = options.publisher || createPubSubPublisher({
    projectId: config.gcpProjectId,
    topicName: config.pubsubTopic || 'medical-orchestrator-events'
  });
  const runSaga = options.runSaga || createSagaRunner({ config });
  const getTraceId = (request) => request.headers['x-trace-id'] || request.headers.traceparent || crypto.randomUUID();

  server.post('/api/v2/flujo', async (request, reply) => {
    const traceId = getTraceId(request);
    const message = {
      traceId,
      type: 'medical-orchestration-flow',
      payload: request.body || {},
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    try {
      const messageId = await publisher.publish(message);
      return reply.code(202).header('X-Trace-Id', traceId).send({
        traceId,
        status: 'pending',
        messageId
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(503).header('X-Trace-Id', traceId).send({
        error: 'Message broker unavailable',
        traceId
      });
    }
  });

  server.get('/api/v2/flujo/:traceId', async (request, reply) => reply.code(501).send({
    error: 'Not Implemented',
    message: 'Durable saga state storage is not configured',
    traceId: request.params.traceId
  }));

  server.post('/internal/pubsub', async (request, reply) => {
    const envelope = request.body || {};
    const encoded = envelope.message && envelope.message.data;

    if (!encoded) {
      return reply.code(400).send({ error: 'Invalid Pub/Sub message' });
    }

    try {
      const message = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      if (!message.traceId) {
        return reply.code(400).send({ error: 'Message traceId is required' });
      }
      const result = await runSaga(message);
      request.log.info({ traceId: result.traceId, steps: result.steps }, 'Saga completed');
      return reply.code(204).send();
    } catch (error) {
      request.log.error({ err: error, traceId: error.traceId }, 'Saga failed');
      return reply.code(500).send({ error: 'Saga processing failed' });
    }
  });

  const fetchExternalCollections = async (config, traceId, paths) => {
    const buildUrl = (baseUrl, path) => `${baseUrl.replace(/\/$/, '')}${path}`;

    const [petAdoption, pss] = await Promise.all([
      Promise.all(paths.petAdoption.map((path) => getJson(buildUrl(config.petAdoptionApiUrl, path), traceId))),
      Promise.all(paths.pss.map((path) => getJson(buildUrl(config.pssApiUrl, path), traceId)))
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
    petAdoption: ['/api/animals'],
    pss: ['/api/vuelos']
  });

  registerCompositionRoute('/orchestrate/nota-medica/:id', {
    petAdoption: ['/api/adoptantes'],
    pss: ['/api/pasajeros']
  });

  registerCompositionRoute('/orchestrate/documento-generado/:id', {
    petAdoption: ['/api/adopciones'],
    pss: ['/api/asientos-asignados']
  });

  server.get('/orchestrate/:id', async (request, reply) => {
    return reply.code(501).send({
      error: 'Not Implemented',
      message: 'The integration contract is still pending'
    });
  });
};

module.exports = orchestrationRoutes;