const Fastify = require('fastify');
const { loadConfig } = require('./config/env');
const orchestrationRoutes = require('./routes/orchestration.routes');
const { createMetrics } = require('./services/metrics');

const buildServer = (options = {}) => {
  const server = Fastify({ logger: options.logger ?? true });
  const config = options.config || loadConfig();
  const metrics = options.metrics || createMetrics();
  metrics.registerRequestHooks(server);

  server.get('/health', async () => ({ status: 'ok' }));
  server.get('/metrics', async (request, reply) => {
    reply.type(metrics.contentType);
    return metrics.getMetrics();
  });
  server.register(orchestrationRoutes, {
    config,
    publisher: options.publisher,
    processFlow: options.processFlow,
    metrics
  });

  return { server, config };
};

const start = async () => {
  const { server, config } = buildServer();

  try {
    await server.listen({ host: '0.0.0.0', port: config.port });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

module.exports = { buildServer };