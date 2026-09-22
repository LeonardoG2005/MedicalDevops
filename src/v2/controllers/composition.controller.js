const crypto = require('node:crypto');

const createCompositionHandler = ({ getLocal, getExternal, localKey }) => async (request, reply) => {
  const traceId = request.headers['x-trace-id'] || crypto.randomUUID();
  const local = await getLocal(request.params.id);

  if (!local) {
    return reply.code(404).send({ error: 'Resource not found', traceId });
  }

  try {
    const external = await getExternal(localKey, request.params.id, traceId);
    return reply.header('X-Trace-Id', traceId).send({
      data: {
        medical: { [localKey]: local },
        external: {
          petAdoption: external.sources.petAdoption,
          pss: external.sources.pss,
        },
      },
      traceId,
    });
  } catch (error) {
    const status = error.status === 404 ? 404 : error.code === 'NOT_CONFIGURED' ? 503 : 502;
    return reply.code(status).send({
      error: status === 404 ? 'External resource not found' : 'External dependency unavailable',
      traceId,
    });
  }
};

module.exports = { createCompositionHandler };