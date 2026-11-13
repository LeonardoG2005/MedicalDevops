// Round 0 runs the flow without protections, Round 1 with them. The flag is
// the only difference between the two rounds: same image, same code, same load.
function isResilienceEnabled() {
  return process.env.RESILIENCE_ENABLED === 'true';
}

function getRound() {
  return isResilienceEnabled() ? '1' : '0';
}

function readPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// Defaults are the ones used in the experiment report. Every value can be
// overridden by environment so the thresholds can be tuned without a rebuild.
function resilienceConfig(overrides = {}) {
  return {
    enabled: overrides.enabled ?? isResilienceEnabled(),
    timeoutMs: overrides.timeoutMs ?? readPositiveInt('RESILIENCE_TIMEOUT_MS', 2000),
    breaker: {
      errorThresholdPercentage: readPositiveInt('BREAKER_ERROR_PERCENTAGE', 50),
      volumeThreshold: readPositiveInt('BREAKER_VOLUME_THRESHOLD', 5),
      resetTimeout: readPositiveInt('BREAKER_RESET_MS', 10000),
      rollingCountTimeout: readPositiveInt('BREAKER_ROLLING_WINDOW_MS', 10000),
      ...(overrides.breaker || {}),
    },
  };
}

module.exports = { isResilienceEnabled, getRound, resilienceConfig };
