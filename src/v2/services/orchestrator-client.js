const crypto = require('node:crypto');

class OrchestratorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'OrchestratorError';
    Object.assign(this, details);
  }
}

const createOrchestratorClient = ({ baseUrl, fetchImplementation = fetch, timeoutMs = 5000 }) => {
  if (!baseUrl) {
    return async () => {
      throw new OrchestratorError('ORCHESTRATOR_URL is not configured', { code: 'NOT_CONFIGURED' });
    };
  }

  return async (resource, id, traceId = crypto.randomUUID()) => {
    let response;
    try {
      response = await fetchImplementation(
        `${baseUrl.replace(/\/$/, '')}/orchestrate/${resource}/${id}`,
        {
          headers: { 'X-Trace-Id': traceId },
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch (error) {
      throw new OrchestratorError('Orchestrator request failed', { cause: error });
    }

    if (!response.ok) {
      throw new OrchestratorError(`Orchestrator returned HTTP ${response.status}`, {
        status: response.status,
      });
    }

    try {
      return await response.json();
    } catch (error) {
      throw new OrchestratorError('Orchestrator returned invalid JSON', { cause: error });
    }
  };
};

module.exports = { OrchestratorError, createOrchestratorClient };