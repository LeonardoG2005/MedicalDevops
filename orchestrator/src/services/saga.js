const { getJson } = require('./api-client');

const createSagaRunner = ({ config, fetchJson = getJson, metrics }) => async (message) => {
  const traceId = message.traceId;
  const steps = [
    {
      name: 'pet-adoption-collection',
      service: 'pet-adoption',
      cloud: 'external',
      endpoint: '/api/animals',
      baseUrl: config.petAdoptionApiUrl
    },
    {
      name: 'pss-flight-collection',
      service: 'kiusys',
      cloud: 'external',
      endpoint: '/api/vuelos',
      baseUrl: config.pssApiUrl
    }
  ];

  for (const step of steps) {
    step.status = 'running';
    const startedAt = process.hrtime.bigint();
    try {
      if (!step.baseUrl) {
        throw new Error(`Missing URL for ${step.name}`);
      }
      step.result = await fetchJson(`${step.baseUrl.replace(/\/$/, '')}${step.endpoint}`, traceId);
      step.status = 'completed';
      metrics?.externalRequest(step.service, 'success', startedAt);
      metrics?.stepCompleted(step);
    } catch (error) {
      step.status = 'failed';
      step.error = { message: error.message, status: error.status };
      metrics?.externalRequest(step.service, 'error', startedAt);
      metrics?.stepFailed(step);
      throw Object.assign(new Error(`Saga step failed: ${step.name}`), { cause: error, steps, traceId });
    }
  }

  return { traceId, status: 'completed', steps };
};

module.exports = { createSagaRunner };