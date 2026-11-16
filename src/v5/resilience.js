const CircuitBreaker = require('opossum');
const { callPeer: defaultCallPeer } = require('./peer-client');

const OUTCOMES = ['ok', 'timeout', 'error', 'circuito_abierto'];

// Two protections wrap every outgoing call when RESILIENCE_ENABLED=true:
//  1. a timeout per dependency (AbortSignal.timeout) so a slow peer can only
//     cost us timeoutMs, never the whole injected latency;
//  2. a circuit breaker per peer (opossum) so after enough failures the call
//     is skipped for resetTimeout ms and the flow answers at once.
// There are deliberately NO retries: against a latency fault a retry doubles
// the pressure on the slow peer and our own latency (retry storm).
// With the flag off the call is made bare, exactly as the v2 integration did,
// which is the Round 0 of the experiment.
function createDependencyCaller({ enabled, timeoutMs, breaker: breakerOptions, metrics, callPeer = defaultCallPeer }) {
  const breakers = new Map();

  function getBreaker(peer) {
    if (!breakers.has(peer)) {
      const instance = new CircuitBreaker((context) => callPeer(peer, context), {
        // The timeout is enforced with the abort signal, not by opossum: opossum
        // would reject the promise but leave the socket open
        timeout: false,
        errorThresholdPercentage: breakerOptions.errorThresholdPercentage,
        volumeThreshold: breakerOptions.volumeThreshold,
        resetTimeout: breakerOptions.resetTimeout,
        rollingCountTimeout: breakerOptions.rollingCountTimeout,
        // A 404 from a peer is data, not an outage: it must not open the circuit
        errorFilter: (error) => error?.status === 404,
        name: peer,
      });
      instance.on('open', () => metrics?.setCircuitState(peer, 'open'));
      instance.on('halfOpen', () => metrics?.setCircuitState(peer, 'halfOpen'));
      instance.on('close', () => metrics?.setCircuitState(peer, 'closed'));
      breakers.set(peer, instance);
    }
    return breakers.get(peer);
  }

  function classify(error, signal) {
    if (error?.code === 'EOPENBREAKER') return 'circuito_abierto';
    if (signal?.aborted) return 'timeout';
    return 'error';
  }

  async function invoke(peer, { traceId, fault, log } = {}) {
    const startedAt = process.hrtime.bigint();
    const result = { peer, estado: 'ok', datos: null, duracion_ms: 0, detalle: null };

    try {
      if (enabled) {
        const signal = AbortSignal.timeout(timeoutMs);
        try {
          result.datos = await getBreaker(peer).fire({ traceId, fault, signal });
        } catch (error) {
          result.estado = classify(error, signal);
          result.detalle = error.message;
        }
      } else {
        result.datos = await callPeer(peer, { traceId, fault });
      }
    } catch (error) {
      result.estado = 'error';
      result.detalle = error.message;
    }

    result.duracion_ms = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
    metrics?.observeDependency({ peer, outcome: result.estado, seconds: result.duracion_ms / 1000 });
    if (result.estado !== 'ok') {
      log?.warn({ evento: 'dependencia_fallida', peer, estado: result.estado, duracion_ms: result.duracion_ms, detalle: result.detalle });
    }
    return result;
  }

  function circuitState(peer) {
    const instance = breakers.get(peer);
    if (!instance) return 'closed';
    if (instance.opened) return 'open';
    if (instance.halfOpen) return 'halfOpen';
    return 'closed';
  }

  return { invoke, circuitState, enabled, timeoutMs };
}

module.exports = { createDependencyCaller, OUTCOMES };
