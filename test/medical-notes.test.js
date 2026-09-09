const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');
const { resetDatabase, createImage } = require('./helpers');

test.beforeEach(async () => {
  await resetDatabase();
});

test('Nota médica: crear, listar, obtener por id, actualizar y eliminar', async () => {
  const app = await buildApp();
  const image = await createImage();

  const created = await app.inject({
    method: 'POST',
    url: '/notas-medicas',
    payload: {
      paciente: 'Paciente 001',
      contenido: 'Paciente presenta dolor de cabeza.',
      fecha: '2026-08-16',
      imagen_id: image.id,
    },
  });

  assert.equal(created.statusCode, 201);
  const createdBody = created.json();

  const list = await app.inject({ method: 'GET', url: '/notas-medicas' });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().length, 1);

  const byId = await app.inject({ method: 'GET', url: `/notas-medicas/${createdBody.id}` });
  assert.equal(byId.statusCode, 200);
  assert.equal(byId.json().paciente, 'Paciente 001');

  const updated = await app.inject({
    method: 'PUT',
    url: `/notas-medicas/${createdBody.id}`,
    payload: {
      paciente: 'Paciente 002',
      contenido: 'Se observa mejoría.',
      fecha: '2026-08-17',
      imagen_id: image.id,
    },
  });

  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().paciente, 'Paciente 002');

  const removed = await app.inject({ method: 'DELETE', url: `/notas-medicas/${createdBody.id}` });
  assert.equal(removed.statusCode, 204);

  const missing = await app.inject({ method: 'GET', url: `/notas-medicas/${createdBody.id}` });
  assert.equal(missing.statusCode, 404);
});


test('Nota médica: PATCH actualiza parcialmente una nota médica', async () => {
  const app = await buildApp();
  const image = await createImage();

  const created = await app.inject({
    method: 'POST',
    url: '/notas-medicas',
    payload: {
      paciente: 'Paciente 001',
      contenido: 'Paciente presenta dolor de cabeza.',
      fecha: '2026-08-16',
      imagen_id: image.id,
    },
  });

  assert.equal(created.statusCode, 201);
  const createdBody = created.json();

  const patched = await app.inject({
    method: 'PATCH',
    url: `/notas-medicas/${createdBody.id}`,
    payload: {
      contenido: 'Se observa mejoría.',
    },
  });

  assert.equal(patched.statusCode, 200);

  const patchedBody = patched.json();

  assert.equal(patchedBody.paciente, 'Paciente 001');
  assert.equal(patchedBody.contenido, 'Se observa mejoría.');
  assert.equal(patchedBody.fecha, '2026-08-16');
  assert.equal(patchedBody.imagen_id, image.id);
});


test('Nota médica: PATCH de id inexistente devuelve 404', async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: 'PATCH',
    url: '/notas-medicas/999',
    payload: {
      contenido: 'Contenido actualizado.',
    },
  });

  assert.equal(response.statusCode, 404);
});

test('Nota médica: QUERY por paciente', async () => {
  const app = await buildApp();
  const image = await createImage();

  await app.inject({
    method: 'POST',
    url: '/notas-medicas',
    payload: {
      paciente: 'Paciente 001',
      contenido: 'Dolor de cabeza.',
      fecha: '2026-08-16',
      imagen_id: image.id,
    },
  });

  const response = await app.inject({
    method: 'QUERY',
    url: '/notas-medicas',
    payload: { paciente: 'Paciente 001' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().length, 1);
  assert.equal(response.json()[0].paciente, 'Paciente 001');
});

test('Nota médica: QUERY por fecha', async () => {
  const app = await buildApp();
  const image = await createImage();

  await app.inject({
    method: 'POST',
    url: '/notas-medicas',
    payload: {
      paciente: 'Paciente 001',
      contenido: 'Dolor de cabeza.',
      fecha: '2026-08-16',
      imagen_id: image.id,
    },
  });

  const response = await app.inject({
    method: 'QUERY',
    url: '/notas-medicas',
    payload: { fecha: '2026-08-16' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().length, 1);
});

test('Nota médica: QUERY sin filtros devuelve todas', async () => {
  const app = await buildApp();
  const image = await createImage();

  await app.inject({
    method: 'POST',
    url: '/notas-medicas',
    payload: {
      paciente: 'Paciente 001',
      contenido: 'Dolor de cabeza.',
      fecha: '2026-08-16',
      imagen_id: image.id,
    },
  });

  const response = await app.inject({
    method: 'QUERY',
    url: '/notas-medicas',
    payload: {},
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().length, 1);
});

test('Nota médica: id inexistente devuelve 404', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/notas-medicas/999' });
  assert.equal(response.statusCode, 404);
});

test('Nota médica: actualizar id inexistente devuelve 404', async () => {
  const app = await buildApp();
  const image = await createImage();
  const response = await app.inject({
    method: 'PUT',
    url: '/notas-medicas/999',
    payload: {
      paciente: 'X',
      contenido: 'Y',
      fecha: '2026-08-16',
      imagen_id: image.id,
    },
  });
  assert.equal(response.statusCode, 404);
});

test('Nota médica: eliminar id inexistente devuelve 404', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'DELETE', url: '/notas-medicas/999' });
  assert.equal(response.statusCode, 404);
});

test('Nota médica: validación de datos inválidos devuelve 400', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/notas-medicas',
    payload: { invalido: true },
  });
  assert.equal(response.statusCode, 400);
});