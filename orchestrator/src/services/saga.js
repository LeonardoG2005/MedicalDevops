const { getJson } = require('./api-client');

const createSagaRunner = ({ config, fetchJson = getJson }) => async (message) => {
  const traceId = message.traceId;
  const steps = [
    {
      name: 'pet-adoption-collection',
      cloud: 'external',
      endpoint: '/api/animals',
      baseUrl: config.petAdoptionApiUrl
    },
    {
      name: 'pss-flight-collection',
      cloud: 'external',
      endpoint: '/api/vuelos',
      baseUrl: config.pssApiUrl
    }
  ];

  for (const step of steps) {
    step.status = 'running';
    try {
      if (!step.baseUrl) {
        throw new Error(`Missing URL for ${step.name}`);
      }
      step.result = await fetchJson(`${step.baseUrl.replace(/\/$/, '')}${step.endpoint}`, traceId);
      step.status = 'completed';
    } catch (error) {
      step.status = 'failed';
      step.error = { message: error.message, status: error.status };
      throw Object.assign(new Error(`Saga step failed: ${step.name}`), { cause: error, steps, traceId });
    }
  }

  return { traceId, status: 'completed', steps };
};

module.exports = { createSagaRunner };