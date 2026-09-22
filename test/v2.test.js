const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');

const localResources = {
  imagen: async (id) => ({ id: Number(id), nombre: 'imagen-local' }),
  notaMedica: async (id) => ({ id: Number(id), paciente: 'Paciente local' }),
  documentoGenerado: async (id) => ({ id: Number(id), nombre: 'documento-local' }),
};

const external = async (resource, id, traceId) => ({
  sources: {
    petAdoption: [{ resource, id, owner: 'pet-adoption' }],
    pss: [{ resource, id, owner: 'kiusys' }],
  },
  traceId,
});

test('V2 composes image data with explicitly labeled external sources', async (t) => {
  const app = await buildApp({ localResources, orchestratorClient: external });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/v2/imagenes/7/composition',
    headers: { 'x-trace-id': 'trace-v2' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-trace-id'], 'trace-v2');
  assert.deepEqual(response.json().data.medical.imagen, { id: 7, nombre: 'imagen-local' });
  assert.equal(response.json().data.external.petAdoption[0].owner, 'pet-adoption');
  assert.equal(response.json().data.external.pss[0].owner, 'kiusys');
});

test('V2 exposes the three local resource composition routes', async (t) => {
  const app = await buildApp({ localResources, orchestratorClient: external });
  t.after(() => app.close());

  for (const path of [
    '/api/v2/notas-medicas/8/composition',
    '/api/v2/documentos-generados/9/composition',
  ]) {
    const response = await app.inject({ method: 'GET', url: path });
    assert.equal(response.statusCode, 200);
    assert.ok(response.json().data.medical);
    assert.ok(response.json().data.external);
  }
});

test('V2 returns 404 when the local resource does not exist', async (t) => {
  const app = await buildApp({
    localResources: { ...localResources, imagen: async () => null },
    orchestratorClient: external,
  });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/api/v2/imagenes/999/composition' });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, 'Resource not found');
});

test('V2 maps orchestrator failures to a dependency error', async (t) => {
  const app = await buildApp({
    localResources,
    orchestratorClient: async () => {
      const error = new Error('unavailable');
      error.status = 503;
      throw error;
    },
  });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/api/v2/imagenes/7/composition' });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, 'External dependency unavailable');
});