const Fastify = require('fastify');

const server = Fastify({ logger: true });
const port = Number.parseInt(process.env.PORT || '4000', 10);

server.get('/health', async () => ({ status: 'ok' }));

const start = async () => {
  try {
    await server.listen({ host: '0.0.0.0', port });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

start();