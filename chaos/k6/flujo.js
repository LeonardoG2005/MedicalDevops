// Generador de carga del experimento (k6). El perfil es fijo y declarado: las
// dos rondas se miden con exactamente esta carga, cambiando solo
// RESILIENCE_ENABLED en el coordinador.
//
//   k6 run chaos/k6/flujo.js -e BASE_URL=http://34.123.58.136 -e RONDA=0
//   k6 run chaos/k6/flujo.js -e BASE_URL=http://localhost:3000 -e RONDA=1 -e PERFIL=humo
//
// Variables: BASE_URL, IMAGEN_ID (numero o "random"), RONDA (0|1), PERFIL
// (completo|humo), P95_MS (umbral, 2000), ERROR_RATE_MAX (0.05), RESULTS_DIR.
import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.4/index.js';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const IMAGEN_ID = __ENV.IMAGEN_ID || 'random';
const RONDA = __ENV.RONDA || '0';
const PERFIL = __ENV.PERFIL || 'completo';
const P95_MS = Number(__ENV.P95_MS || 2000);
const ERROR_RATE_MAX = Number(__ENV.ERROR_RATE_MAX || 0.05);
const RESULTS_DIR = (__ENV.RESULTS_DIR || 'chaos/results').replace(/\/$/, '');

// Perfil declarado del experimento: 10 usuarios virtuales en bucle cerrado,
// 30 s de subida, 4 min sostenidos, 30 s de bajada (5 min en total).
// "humo" es una version de 15 s para validar la configuracion, no para medir.
const PERFILES = {
  completo: [
    { duration: '30s', target: 10 },
    { duration: '4m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  humo: [
    { duration: '5s', target: 3 },
    { duration: '5s', target: 3 },
    { duration: '5s', target: 0 },
  ],
};

export const flujoDegradado = new Rate('flujo_degradado');
export const flujoCircuitoAbierto = new Rate('flujo_circuito_abierto');
export const dependenciaAngelMs = new Trend('dependencia_angel_ms', true);
export const dependenciaJuanMs = new Trend('dependencia_juan_ms', true);

export const options = {
  scenarios: {
    flujo: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: PERFILES[PERFIL] || PERFILES.completo,
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // Metrica objetivo del experimento: p95 extremo a extremo del flujo
    http_req_duration: [`p(95)<${P95_MS}`],
    // Metrica de guarda: tasa de error del flujo. La segunda regla es la
    // condicion de aborto: si mas de la mitad de las peticiones fallan durante
    // un minuto, k6 detiene la carga para no seguir castigando al sistema.
    http_req_failed: [
      `rate<${ERROR_RATE_MAX}`,
      { threshold: 'rate<0.5', abortOnFail: true, delayAbortEval: '60s' },
    ],
    checks: ['rate>0.95'],
  },
  tags: { ronda: RONDA, perfil: PERFIL },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  userAgent: 'k6-medical-chaos/5.0.0',
};

export default function () {
  const traceId = `k6-r${RONDA}-${__VU}-${__ITER}-${Date.now().toString(36)}`;
  const res = http.get(`${BASE_URL}/api/v5/flujo/${IMAGEN_ID}`, {
    headers: { 'X-Trace-Id': traceId, Accept: 'application/json' },
    tags: { name: 'flujo', ronda: RONDA },
    timeout: '30s',
  });

  let body = null;
  try { body = res.json(); } catch (e) { body = null; }

  check(res, {
    'estado 200': (r) => r.status === 200,
    'trace id devuelto': (r) => r.headers['X-Trace-Id'] === traceId,
    'cuerpo con dependencias': () => body && body.dependencias !== undefined,
  });

  if (body && body.dependencias) {
    flujoDegradado.add(body.degradado === true);
    const angel = body.dependencias.angel;
    const juan = body.dependencias.juan;
    flujoCircuitoAbierto.add(Boolean(angel && angel.estado === 'circuito_abierto'));
    if (angel && typeof angel.duracion_ms === 'number') dependenciaAngelMs.add(angel.duracion_ms);
    if (juan && typeof juan.duracion_ms === 'number') dependenciaJuanMs.add(juan.duracion_ms);
  } else {
    flujoDegradado.add(false);
    flujoCircuitoAbierto.add(false);
  }
}

// Un JSON por ronda, legible por chaos/gate.js, mas el resumen de texto habitual
export function handleSummary(data) {
  const out = {};
  out[`${RESULTS_DIR}/k6-ronda-${RONDA}.json`] = JSON.stringify({
    ronda: RONDA,
    perfil: PERFIL,
    base_url: BASE_URL,
    imagen_id: IMAGEN_ID,
    umbrales: { p95_ms: P95_MS, error_rate_max: ERROR_RATE_MAX },
    generado: new Date().toISOString(),
    ...data,
  }, null, 2);
  out.stdout = textSummary(data, { indent: ' ', enableColors: false });
  return out;
}
