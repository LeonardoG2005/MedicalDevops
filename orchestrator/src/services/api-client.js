const DEFAULT_TIMEOUT_MS = 5000;

class ExternalApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ExternalApiError';
    Object.assign(this, details);
  }
}

const getJson = async (url, traceparent, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  let response;

  try {
    response = await fetch(url, {
      headers: traceparent ? { traceparent } : {},
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new ExternalApiError('External API request failed', { cause: error });
  }

  if (!response.ok) {
    throw new ExternalApiError(`External API returned HTTP ${response.status}`, {
      status: response.status
    });
  }

  try {
    return await response.json();
  } catch (error) {
    throw new ExternalApiError('External API returned invalid JSON', { cause: error });
  }
};

module.exports = { ExternalApiError, getJson };