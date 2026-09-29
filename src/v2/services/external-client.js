const DEFAULT_TIMEOUT_MS = 5000;

class ExternalApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ExternalApiError';
    Object.assign(this, details);
  }
}

const getJson = async (url, traceId, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  let response;

  try {
    response = await fetch(url, {
      headers: { 'X-Trace-Id': traceId, traceparent: traceId },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ExternalApiError('External API request failed', { cause: error });
  }

  if (!response.ok) {
    throw new ExternalApiError(`External API returned HTTP ${response.status}`, { status: response.status });
  }

  try {
    return await response.json();
  } catch (error) {
    throw new ExternalApiError('External API returned invalid JSON', { cause: error });
  }
};

const unwrap = (response) => response?.data ?? response;

const createExternalClient = ({ petAdoptionApiUrl, pssApiUrl }) => ({
  getRandomAnimal: async (traceId) => {
    if (!petAdoptionApiUrl) {
      throw new ExternalApiError('API_C_URL is not configured', { code: 'NOT_CONFIGURED' });
    }
    const response = await getJson(`${petAdoptionApiUrl.replace(/\/$/, '')}/api/v2/animals/random`, traceId);
    return unwrap(response);
  },
  getRandomVuelo: async (traceId) => {
    if (!pssApiUrl) {
      throw new ExternalApiError('API_A_URL is not configured', { code: 'NOT_CONFIGURED' });
    }
    const response = await getJson(`${pssApiUrl.replace(/\/$/, '')}/api/v2/entidades/vuelos/random`, traceId);
    return unwrap(response);
  },
});

module.exports = { createExternalClient, ExternalApiError };