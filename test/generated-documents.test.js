const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');
const { resetDatabase, createImage, createNote } = require('./helpers');

test.beforeEach(async () => {
  await resetDatabase();
});

test('Documento generado: crear, listar, obtener por id, actualizar y eliminar', async () => {
  const app = await buildApp();
  const image = await createImage();
  const note = await createNote({ imagen_id: image.id });

  const created = await app.inject({
    method: 'POST',
    url: '/documentos-generados',
    payload: {
      nombre: 'reporte_001.pdf',
      tipo: 'PDF',
      url: 'https://example.com/reporte_001.pdf',
      fecha_generacion: '2026-08-16',
      nota_medica_id: note.id,
    },
  });

  assert.equal(created.statusCode, 201);
  const createdBody = created.json();

  const list = await app.inject({ method: 'GET', url: '/documentos-generados' });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().length, 1);

  const byId = await app.inject({ method: 'GET', url: `/documentos-generados/${createdBody.id}` });
  assert.equal(byId.statusCode, 200);
  assert.equal(byId.json().nombre, 'reporte_001.pdf');

  const updated = await app.inject({
    method: 'PUT',
    url: `/documentos-generados/${createdBody.id}`,
    payload: {
      nombre: 'reporte_002.pdf',
      tipo: 'PDF',
      url: 'https://example.com/reporte_002.pdf',
      fecha_generacion: '2026-08-17',
      nota_medica_id: note.id,
    },
  });

  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().nombre, 'reporte_002.pdf');

  const removed = await app.inject({ method: 'DELETE', url: `/documentos-generados/${createdBody.id}` });
  assert.equal(removed.statusCode, 204);

jsdkfjskjfk fallo a proposito
  assert.equal(missing.statusCode, 404);
});