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

  const vueloRaw = entities.apiA;
  const vuelo = vueloRaw && typeof vueloRaw.vuelo === 'object' ? vueloRaw.vuelo : vueloRaw;

  const body = {
    vuelo_id: vuelo?.id ?? null,
    origen: vuelo?.origen ?? null,
    destino: vuelo?.destino ?? null,
    fecha: vuelo?.fecha ?? null,
    mensaje: {
      traceId,
      type: 'medical-orchestration-flow',
      status: 'completed',
      pasos: [
        { api: 'medical-api', cloud: 'gcp', entidad: entities.medical },
        { api: 'adoption-api', cloud: 'aws', entidad: entities.apiC },
        { api: 'api-a-pss', cloud: 'oci', entidad: entities.apiA },
      ],
    },
  };

  if (config.apiAUrl) {
    const startedAt = process.hrtime.bigint();
    try {
      await postJson(`${config.apiAUrl.replace(/\/$/, '')}/api/v2/mensaje`, body, traceId);
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