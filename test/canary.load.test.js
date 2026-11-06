const test = require('node:test');
const assert = require('node:assert/strict');
const { percentile, tally, noteRequest } = require('../canary/load');

test('percentile calcula p50 y p95 sobre una lista ordenada', () => {
  const valores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(valores, 0.5), 50);
  assert.equal(percentile(valores, 0.95), 100);
});

test('percentile de una lista vacía es 0', () => {
  assert.equal(percentile([], 0.95), 0);
});

test('tally agrupa por track y cuenta errores y latencias por separado', () => {
  const outcomes = [
    { statusCode: 200, track: 'stable', latencyMs: 10 },
    { statusCode: 500, track: 'stable', latencyMs: 20 },
    { statusCode: 200, track: 'canary', latencyMs: 30 },
  ];

  const result = tally(outcomes);

  assert.equal(result.stable.total, 2);
  assert.equal(result.stable.errors, 1);
  assert.equal(result.canary.total, 1);
  assert.equal(result.canary.errors, 0);
});

test('tally agrupa como "desconocido" cuando no hay cabecera X-Track', () => {
  const result = tally([{ statusCode: 200, track: null, latencyMs: 5 }]);
  assert.equal(result.desconocido.total, 1);
});

test('las escrituras de negocio pares van a la ruta v1 sin prioridad, que ambas revisiones aceptan', () => {
  const { path, body } = noteRequest(2, 7, true);
  assert.equal(path, '/notas-medicas');
  assert.equal(body.imagen_id, 7);
  assert.equal('prioridad' in body, false);
});

test('una nota v1 inválida es la que no trae contenido', () => {
  const { path, body } = noteRequest(4, 7, false);
  assert.equal(path, '/notas-medicas');
  assert.equal('contenido' in body, false);
});

test('las escrituras de negocio impares van a /api/v4 con prioridad', () => {
  assert.deepEqual(
    [noteRequest(1, 7, true).path, noteRequest(3, 7, false).body.prioridad],
    ['/api/v4/notas-medicas', 'invalida'],
  );
  assert.ok(['baja', 'media', 'alta', 'critica'].includes(noteRequest(1, 7, true).body.prioridad));
});
