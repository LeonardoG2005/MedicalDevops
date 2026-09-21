const orchestrationRoutes = async (server) => {
  server.get('/orchestrate/:id', async (request, reply) => {
    return reply.code(501).send({
      error: 'Not Implemented',
      message: 'The integration contract is still pending'
    });
  });
};

module.exports = orchestrationRoutes;