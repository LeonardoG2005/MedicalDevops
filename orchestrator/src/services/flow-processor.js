const { getJson } = require('./api-client');

const createFlowProcessor = ({ config, metrics }) => async (message) => {
  const traceId = message.traceId;
  const resource = message.payload?.resource;
  const id = message.payload?.id;

  if (resource !== 'imagen' || id === undefined) {
    throw new Error('Invalid flow payload: resource=imagen and id are required');
  }

  const requests = [
    {
      name: 'medical',
      service: 'medical-api',
      url: `${config.medicalApiUrl.replace(/\/$/, '')}/api/v2/imagenes/${id}`,
    },
    {
      name: 'apiA',
      service: 'api-a',
      url: `${config.apiAUrl.replace(/\/$/, '')}/api/v2/entidades/vuelos/random`,
    },
    {
      name: 'apiC',
      service: 'api-c',
      url: `${config.apiCUrl.replace(/\/$/, '')}/api/v2/animals/random`,
    },
  ];

  const entities = {};

  for (const request of requests) {
    const startedAt = process.hrtime.bigint();

    try {
      entities[request.name] = await getJson(request.url, traceId);

      metrics?.externalRequest(request.service, 'success', startedAt);
    } catch (error) {
      metrics?.externalRequest(request.service, 'error', startedAt);
      throw error;
    }
  }

  return {
    traceId,
    status: 'completed',
    entities,
  };
};

module.exports = { createFlowProcessor };