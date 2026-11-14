const crypto = require('node:crypto');
const { PEERS } = require('./repository');

const TOKEN_HEADER = 'x-chaos-token';
const MIN_TOKEN_LENGTH = 16;
const MAX_TTL_SECONDS = 900;
const MAX_LATENCY_MS = 10000;

function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || provided.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

const faultBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['peer', 'ttl_seconds'],
  properties: {
    peer: { type: 'string', enum: PEERS },
    latency_ms: { type: 'integer', minimum: 0, maximum: MAX_LATENCY_MS, default: 0 },
    error_rate: { type: 'number', minimum: 0, maximum: 1, default: 0 },
    ttl_seconds: { type: 'integer', minimum: 1, maximum: MAX_TTL_SECONDS },
    motivo: { type: 'string', maxLength: 200 },
  },
};

const faultSchema = {
  type: 'object',
  properties: {
    peer: { type: 'string' },
    latency_ms: { type: 'integer' },
    error_rate: { type: 'number' },
    expires_at: { type: 'string' },
    created_at: { type: 'string' },
    segundos_restantes: { type: 'integer' },
    creado_por: { type: ['string', 'null'] },
    motivo: { type: ['string', 'null'] },
  },
};

// The chaos switch. Three controls keep it from being used by accident or by
// strangers: it only exists when CHAOS_ENABLED=true, every call needs the
// shared token, and every fault has a TTL (max 15 min) after which it reverts
// on its own. The paths are outside /api so the v4 X-Fault hook never touches them.
async function chaosRoutes(app, { repository, cache }) {
  if (process.env.CHAOS_ENABLED !== 'true') {
    return;
  }
  const token = process.env.CHAOS_TOKEN || '';
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`CHAOS_TOKEN debe tener al menos ${MIN_TOKEN_LENGTH} caracteres cuando CHAOS_ENABLED=true`);
  }

  app.addHook('preHandler', async (request, reply) => {
    if (!tokenMatches(request.headers[TOKEN_HEADER], token)) {
      request.log.warn({ evento: 'chaos_token_invalido', ruta: request.url });
      return reply.code(401).send({ error: 'No autorizado', traceId: request.id });
    }
  });

  app.get('/internal/chaos', {
    schema: { hide: true, response: { 200: { type: 'array', items: faultSchema } } },
  }, async () => repository.listActive());

  app.post('/internal/chaos', {
    schema: { hide: true, body: faultBodySchema, response: { 201: faultSchema } },
  }, async (request, reply) => {
    const { peer, latency_ms: latencyMs, error_rate: errorRate, ttl_seconds: ttlSeconds, motivo } = request.body;
    if (!latencyMs && !errorRate) {
      return reply.code(400).send({ error: 'Indique latency_ms o error_rate mayor que cero', traceId: request.id });
    }
    const fault = await repository.upsertFault({
      peer, latencyMs, errorRate, ttlSeconds, motivo,
      creadoPor: request.headers['user-agent']?.slice(0, 100) || null,
    });
    cache.invalidate();
    request.log.warn({ evento: 'chaos_fault_cambiado', accion: 'activar', peer, latency_ms: latencyMs, error_rate: errorRate, ttl_seconds: ttlSeconds, expires_at: fault.expires_at });
    return reply.code(201).send(fault);
  });

  const borrar = async (request, peer) => {
    const eliminados = await repository.deleteFaults(peer);
    cache.invalidate();
    request.log.warn({ evento: 'chaos_fault_cambiado', accion: 'revertir', peer: peer || 'todos', eliminados });
    return { eliminados };
  };

  app.delete('/internal/chaos', { schema: { hide: true } }, async (request) => borrar(request));

  app.delete('/internal/chaos/:peer', {
    schema: { hide: true, params: { type: 'object', properties: { peer: { type: 'string', enum: PEERS } } } },
  }, async (request) => borrar(request, request.params.peer));
}

module.exports = { chaosRoutes, tokenMatches, TOKEN_HEADER, MAX_TTL_SECONDS, MAX_LATENCY_MS };
