const { getJson, postJson } = require('./api-client');

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
      cloud: 'gcp',
      url: `${config.medicalApiUrl.replace(/\/$/, '')}/imagenes/${id}`,
    },
    {
      name: 'apiA',
      service: 'api-a',
      cloud: 'oci',
      url: `${config.apiAUrl.replace(/\/$/, '')}/api/v2/entidades/vuelos/random`,
    },
    {
      name: 'apiC',
      service: 'api-c',
      cloud: 'aws',
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

  const finalMessage = {
    traceId,
    type: 'medical-orchestration-flow',
    status: 'completed',
    pasos: [
      { api: 'api_b', cloud: 'gcp', entidad: entities.medical },
      { api: 'api_c', cloud: 'aws', entidad: entities.apiC },
    ],
  };

  // NOTA: confirmar con Juan el nombre exacto de los campos que espera /api/v2/mensaje.
  if (config.apiAUrl) {
    const startedAt = process.hrtime.bigint();
    try {
      await postJson(`${config.apiAUrl.replace(/\/$/, '')}/api/v2/mensaje`, finalMessage, traceId);
      metrics?.externalRequest('api-a-mensaje', 'success', startedAt);
    } catch (error) {
      metrics?.externalRequest('api-a-mensaje', 'error', startedAt);
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