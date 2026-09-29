const crypto = require('node:crypto');
const { createPubSubPublisher } = require('../services/pubsub-publisher');
const { createFlowProcessor } = require('../services/flow-processor');

const orchestrationRoutes = async (server, options) => {
  const config = options.config;
  const metrics = options.metrics;
  const publisher = options.publisher || createPubSubPublisher({
    projectId: config.gcpProjectId,
    topicName: config.pubsubTopic || 'medical-orchestrator-events'
  });
  const completionPublisher = options.completionPublisher || createPubSubPublisher({
    projectId: config.gcpProjectId,
    topicName: config.completedTopic || 'medical-orchestrator-completed-events'
  });
  const processFlow = options.processFlow || createFlowProcessor({ config, metrics, completionPublisher });
  const getTraceId = (request) => request.headers['x-trace-id'] || request.headers.traceparent || crypto.randomUUID();

  server.post('/api/v2/flujo', async (request, reply) => {
    const traceId = getTraceId(request);
    const startedAt = metrics.flowStarted();
    const message = {
      traceId,
      type: 'medical-orchestration-flow',
      payload: request.body || {},
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    try {
      const messageId = await publisher.publish(message);
      metrics.flowCompleted(startedAt);
      return reply.code(202).header('X-Trace-Id', traceId).send({
        traceId,
        status: 'pending',
        messageId
      });
    } catch (error) {
      metrics.flowFailed(startedAt);
      request.log.error(error);
      return reply.code(503).header('X-Trace-Id', traceId).send({
        error: 'Message broker unavailable',
        traceId
      });
    }
  });

  server.post('/internal/pubsub', async (request, reply) => {
    const envelope = request.body || {};
    const encoded = envelope.message && envelope.message.data;
    const deliveryAttempt = envelope.deliveryAttempt || 1;

    if (!encoded) {
      return reply.code(400).send({ error: 'Invalid Pub/Sub message' });
    }

    if (deliveryAttempt > 1) {
      metrics.queueReprocessed();
    }

    let message;
    try {
      message = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      if (!message.traceId) {
        return reply.code(400).send({ error: 'Message traceId is required' });
      }
      const result = await processFlow(message);
      request.log.info({
        traceId: result.traceId,
        resource: message.payload && message.payload.resource,
        resourceId: message.payload && message.payload.id,
        entities: result.entities
      }, 'Flow completed');
      return reply.code(204).send();
    } catch (error) {
      request.log.error({
        err: error,
        traceId: message && message.traceId,
        resource: message && message.payload && message.payload.resource,
        resourceId: message && message.payload && message.payload.id
      }, 'Flow failed');
      return reply.code(500).send({ error: 'Flow processing failed' });
    }
  });
};

module.exports = orchestrationRoutes;