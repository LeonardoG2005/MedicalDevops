const test = require('node:test');
const assert = require('node:assert/strict');
const { decide, renderMarkdown } = require('../chaos/gate');

const slo = { p95_ms: 2000, error_rate_max: 0.05, peticiones_minimas: 300 };

const resumen = ({ p95 = 800, errores = 0.01, peticiones = 1500, rotos = {} } = {}) => ({
  metrics: {
    http_reqs: { values: { count: peticiones } },
    http_req_duration: { values: { 'p(95)': p95, 'p(99)': p95 * 1.4 }, thresholds: { 'p(95)<2000': { ok: p95 < 2000, ...rotos.duracion } } },
    http_req_failed: { values: { rate: errores }, thresholds: { 'rate<0.05': { ok: errores < 0.05 } } },
    flujo_degradado: { values: { rate: 0.9 } },
    flujo_circuito_abierto: { values: { rate: 0.6 } },
    dependencia_angel_ms: { values: { 'p(95)': 1990 } },
  },
});

const diario = ({ status = 'completed', deviated = false, rollbackStatus = 'succeeded' } = {}) => ({
  status,
  deviated,
  rollbacks: [{ status: rollbackStatus, activity: { name: 'revertir-la-latencia' } }],
  steady_states: { before: { steady_state_met: true }, after: { steady_state_met: !deviated } },
});

test('Gate: aprueba cuando la metrica objetivo cumple y el experimento no se desvio (ronda 1)', () => {
  const resultado = decide({ summary: resumen(), journal: diario(), slo });

  assert.equal(resultado.veredicto, 'APROBADO');
  assert.deepEqual(resultado.razones, []);
  assert.equal(resultado.k6.p95_ms, 800);
  assert.match(renderMarkdown(resultado, '1'), /APROBADO/);
});

test('Gate: rechaza cuando el p95 supera el umbral (ronda 0 con la latencia inyectada)', () => {
  const resultado = decide({ summary: resumen({ p95: 3200 }), journal: diario({ deviated: true }), slo });

  assert.equal(resultado.veredicto, 'RECHAZADO');
  assert.ok(resultado.razones.some((r) => r.includes('p95 3200 ms supera')));
  assert.ok(resultado.razones.some((r) => r.includes('desviado')));
  assert.ok(resultado.razones.some((r) => r.includes('Umbral de k6 incumplido')));
});

test('Gate: rechaza por tasa de error aunque la latencia cumpla', () => {
  const resultado = decide({ summary: resumen({ errores: 0.2 }), journal: diario(), slo });

  assert.equal(resultado.veredicto, 'RECHAZADO');
  assert.ok(resultado.razones.some((r) => r.includes('Tasa de error')));
});

test('Gate: la falta de evidencia nunca aprueba', () => {
  const sinK6 = decide({ summary: null, journal: diario(), slo });
  const sinDiario = decide({ summary: resumen(), journal: null, slo });
  const pocaMuestra = decide({ summary: resumen({ peticiones: 20 }), journal: diario(), slo });

  assert.equal(sinK6.veredicto, 'RECHAZADO');
  assert.equal(sinDiario.veredicto, 'RECHAZADO');
  assert.equal(pocaMuestra.veredicto, 'RECHAZADO');
  assert.ok(pocaMuestra.razones[0].includes('Muestra insuficiente'));
});

test('Gate: un rollback fallido o un experimento interrumpido rechazan', () => {
  const rollback = decide({ summary: resumen(), journal: diario({ rollbackStatus: 'failed' }), slo });
  const interrumpido = decide({ summary: resumen(), journal: diario({ status: 'interrupted' }), slo });

  assert.ok(rollback.razones.some((r) => r.includes('Rollback fallido: revertir-la-latencia')));
  assert.ok(interrumpido.razones.some((r) => r.includes('"interrupted"')));
});
