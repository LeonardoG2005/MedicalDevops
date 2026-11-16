const { query } = require('../db/connection');
const { getImagenById } = require('../controllers/images.controller');
const { PEERS } = require('./peer-client');
const { getRound } = require('./config');

const ORDEN = ['angel', 'juan'];

async function getImagenRandom() {
  const result = await query('SELECT * FROM imagenes ORDER BY random() LIMIT 1');
  return result.rows[0] || null;
}

function describir(resultado) {
  const { nube, entidad } = PEERS[resultado.peer];
  return {
    estado: resultado.estado,
    duracion_ms: resultado.duracion_ms,
    nube,
    entidad,
    detalle: resultado.detalle,
  };
}

// The flow: local image, then Angel (AWS), then Juan (OCI), one after the
// other, with the same trace id on every hop. Round 0 stops at the first
// failed hop and answers 502, like the v2 integration. Round 1 finishes the
// chain and answers 200 with the fields it could not get set to null and
// degradado=true: a partial answer instead of an error.
async function ejecutarFlujo({ imagen, traceId, caller, faults, metrics, log }) {
  const ronda = getRound();
  const activos = await faults.get();
  const resultados = {};
  let degradado = false;

  for (const peer of ORDEN) {
    const resultado = await caller.invoke(peer, { traceId, fault: activos[peer], log });
    resultados[peer] = resultado;
    if (resultado.estado !== 'ok') {
      degradado = true;
      if (!caller.enabled) {
        break;
      }
    }
  }

  const dependencias = Object.fromEntries(
    Object.entries(resultados).map(([peer, resultado]) => [peer, describir(resultado)]),
  );

  if (degradado && !caller.enabled) {
    metrics.countFlow('error');
    log.error({ evento: 'flujo_fallido', ronda, dependencias });
    return {
      status: 502,
      body: { error: 'Error consultando las APIs de los compañeros', traceId, ronda, dependencias },
    };
  }

  metrics.countFlow(degradado ? 'degradado' : 'ok');
  log.info({ evento: 'flujo_completado', ronda, degradado, dependencias });
  return {
    status: 200,
    degradado,
    body: {
      traceId,
      ronda,
      degradado,
      imagen,
      animal: resultados.angel?.datos ?? null,
      vuelo: resultados.juan?.datos ?? null,
      dependencias,
    },
  };
}

function createFlujoHandlers({ caller, faults, metrics }) {
  async function responder(request, reply, imagen) {
    if (!imagen) {
      return reply.code(404).send({ error: 'Imagen no encontrada', traceId: request.id });
    }
    const resultado = await ejecutarFlujo({
      imagen,
      traceId: request.id,
      caller,
      faults,
      metrics,
      log: request.log,
    });
    reply.header('X-Ronda', resultado.body.ronda);
    if (resultado.degradado) {
      reply.header('X-Degraded', 'true');
    }
    return reply.code(resultado.status).send(resultado.body);
  }

  return {
    flujoPorImagen: async (request, reply) => responder(request, reply, await getImagenById(request.params.imagenId)),
    flujoRandom: async (request, reply) => responder(request, reply, await getImagenRandom()),
  };
}

module.exports = { ejecutarFlujo, createFlujoHandlers, ORDEN };
