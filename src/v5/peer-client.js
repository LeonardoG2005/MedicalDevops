const { setTimeout: sleep } = require('node:timers/promises');
const { TRACE_HEADER } = require('../trace');

// The chain keeps the endpoints and the env var names of the v2 integration:
// API_C_URL is Angel (AWS) and API_A_URL is Juan (OCI), as in every release
const PEERS = {
  angel: {
    envVar: 'API_C_URL',
    path: '/api/v2/animals/random',
    entidad: 'animal',
    nube: 'aws',
    propietario: 'Angel',
  },
  juan: {
    envVar: 'API_A_URL',
    path: '/api/v2/entidades/vuelos/random',
    entidad: 'vuelo',
    nube: 'oci',
    propietario: 'Juan',
  },
};

class PeerError extends Error {
  constructor(message, { peer, status = 0, kind = 'http' } = {}) {
    super(message);
    this.name = 'PeerError';
    this.peer = peer;
    this.status = status;
    this.kind = kind;
  }
}

function peerUrl(peer) {
  const definition = PEERS[peer];
  if (!definition) {
    throw new Error(`Compañero desconocido: ${peer}`);
  }
  const baseUrl = process.env[definition.envVar];
  if (!baseUrl) {
    throw new PeerError(`Falta ${definition.envVar} en las variables de entorno`, {
      peer,
      kind: 'configuracion',
    });
  }
  return `${baseUrl.replace(/\/$/, '')}${definition.path}`;
}

// One outgoing call. The injected fault (from the chaos switch) is applied
// here, on the way out, never on the incoming request: that is what the
// experiment is about. The sleep shares the abort signal with fetch, so a
// timeout interrupts an injected delay exactly like a slow network.
async function callPeer(peer, { traceId, signal, fault, fetchImpl = fetch } = {}) {
  const url = peerUrl(peer);

  if (fault?.latency_ms > 0) {
    await sleep(fault.latency_ms, undefined, { signal });
  }
  if (fault?.error_rate > 0 && Math.random() < fault.error_rate) {
    throw new PeerError('Fallo inyectado en la llamada saliente', {
      peer,
      status: 503,
      kind: 'inyectado',
    });
  }

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(traceId ? { [TRACE_HEADER]: traceId } : {}),
    },
    signal,
  });

  if (!response.ok) {
    throw new PeerError(`La API de ${PEERS[peer].propietario} respondió ${response.status}`, {
      peer,
      status: response.status,
    });
  }

  return response.json();
}

module.exports = { PEERS, PeerError, peerUrl, callPeer };
