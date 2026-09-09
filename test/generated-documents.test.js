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

  const missing = await app.inject({ method: 'GET', url: `/documentos-generados/${createdBody.id}` });
  assert.equal(missing.statusCode, 404);
});

test('Documento generado: PATCH actualiza parcialmente un documento', async () => {
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

  const patched = await app.inject({
    method: 'PATCH',
    url: `/documentos-generados/${createdBody.id}`,
    payload: {
      nombre: 'reporte_actualizado.pdf',
    },
  });

  assert.equal(patched.statusCode, 200);

  const patchedBody = patched.json();

  assert.equal(patchedBody.nombre, 'reporte_actualizado.pdf');
  assert.equal(patchedBody.tipo, 'PDF');
  assert.equal(
    patchedBody.url,
    'https://example.com/reporte_001.pdf',
  );
  assert.equal(patchedBody.fecha_generacion, '2026-08-16');
  assert.equal(patchedBody.nota_medica_id, note.id);
});

test('Documento generado: PATCH de id inexistente devuelve 404', async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: 'PATCH',
    url: '/documentos-generados/999',
    payload: {
      nombre: 'documento_actualizado.pdf',
    },
  });

  assert.equal(response.statusCode, 404);
});

test('Documento generado: QUERY por tipo', async () => {
  const app = await buildApp();
  const image = await createImage();
  const note = await createNote({ imagen_id: image.id });

  await app.inject({
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

  const response = await app.inject({
    method: 'QUERY',
    url: '/documentos-generados',
    payload: { tipo: 'PDF' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().length, 1);
});

test('Documento generado: QUERY por nombre, fecha_generacion y nota_medica_id', async () => {
  const app = await buildApp();
  const image = await createImage();
  const note = await createNote({ imagen_id: image.id });

  await app.inject({
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

  const byNombre = await app.inject({
    method: 'QUERY',
    url: '/documentos-generados',
    payload: { nombre: 'reporte' },
  });
  assert.equal(byNombre.statusCode, 200);
  assert.equal(byNombre.json().length, 1);

  const byFecha = await app.inject({
    method: 'QUERY',
    url: '/documentos-generados',
    payload: { fecha_generacion: '2026-08-16' },
  });
  assert.equal(byFecha.statusCode, 200);
  assert.equal(byFecha.json().length, 1);

  const byNota = await app.inject({
    method: 'QUERY',
    url: '/documentos-generados',
    payload: { nota_medica_id: note.id },
  });
  assert.equal(byNota.statusCode, 200);
  assert.equal(byNota.json().length, 1);
});

test('Documento generado: actualizar id inexistente devuelve 404', async () => {
  const app = await buildApp();
  const image = await createImage();
  const note = await createNote({ imagen_id: image.id });
  const response = await app.inject({
    method: 'PUT',
    url: '/documentos-generados/999',
    payload: {
      nombre: 'x.pdf',
      tipo: 'PDF',
      url: 'https://example.com/x.pdf',
      fecha_generacion: '2026-08-16',
      nota_medica_id: note.id,
    },
  });
  assert.equal(response.statusCode, 404);
});

test('Documento generado: eliminar id inexistente devuelve 404', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'DELETE', url: '/documentos-generados/999' });
  assert.equal(response.statusCode, 404);
});

test('Documento generado: validación de datos inválidos devuelve 400', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/documentos-generados',
    payload: { invalido: true },
  });
  assert.equal(response.statusCode, 400);
});