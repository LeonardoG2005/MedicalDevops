const test = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: sleep } = require('node:timers/promises');
const { buildApp } = require('../src/app');
const { resetDatabase, createImage } = require('./helpers');
const { startPeerMock } = require('../chaos/mocks/peer-mock');
const { createFlowArchive } = require('../src/v5/archivo');

// Fake Cloud Storage client: records what the archive would write
function fakeStorage() {
  const objetos = new Map();
  let fallar = false;
  return {
    objetos,
    setFallar: (v) => { fallar = v; },
    bucket: () => ({
      file: (name) => ({
        save: async (contenido, opciones) => {
          if (fallar) throw new Error('bucket no disponible');
          objetos.set(name, { contenido: JSON.parse(contenido), opciones });
        },
      }),
    }),
  };
}

let angel; let juan;
test.before(async () => {
  angel = await startPeerMock({ name: 'angel' });
  juan = await startPeerMock({ name: 'juan' });
  process.env.API_C_URL = angel.url;
  process.env.API_A_URL = juan.url;
});
test.after(async () => { await angel.close(); await juan.close(); delete process.env.API_C_URL; delete process.env.API_A_URL; });
test.beforeEach(async () => { await resetDatabase(); });

test('Archivo: sin FLOW_ARCHIVE_BUCKET el archivo esta apagado', () => {
  const archivo = createFlowArchive({ bucketName: '' });
  assert.equal(archivo.enabled, false);
});

test('Archivo: cada ejecucion del flujo se guarda como flujo/<traceId>.json sin retrasar la respuesta', async () => {
  const storage = fakeStorage();
  const archivo = createFlowArchive({ bucketName: 'bucket-de-prueba', storage });
  const app = await buildApp({ chaos: { cacheTtlMs: 0 }, flowArchive: archivo });
  const image = await createImage();

  const r = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}`, headers: { 'x-trace-id': 'archivo-0001' } });
  assert.equal(r.statusCode, 200);
  await sleep(20);

  const guardado = storage.objetos.get('flujo/archivo-0001.json');
  assert.ok(guardado, 'el objeto se escribio en el bucket');
  assert.equal(guardado.contenido.traceId, 'archivo-0001');
  assert.equal(guardado.contenido.status, 200);
  assert.equal(guardado.contenido.flujo.imagen.id, image.id);
  assert.equal(guardado.opciones.contentType, 'application/json');
});

test('Archivo: un bucket caido no afecta la respuesta del flujo', async () => {
  const storage = fakeStorage();
  storage.setFallar(true);
  const archivo = createFlowArchive({ bucketName: 'bucket-de-prueba', storage });
  const app = await buildApp({ chaos: { cacheTtlMs: 0 }, flowArchive: archivo });
  const image = await createImage();

  const r = await app.inject({ method: 'GET', url: `/api/v5/flujo/${image.id}` });
  assert.equal(r.statusCode, 200);
  await sleep(20);
  assert.equal(storage.objetos.size, 0);
});
