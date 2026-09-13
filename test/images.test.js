const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');
const { resetDatabase } = require('./helpers');

test.beforeEach(async () => {
  await resetDatabase();
});

test('Imagen: crear, listar, obtener por id, actualizar y eliminar', async () => {
  const app = await buildApp();

  const created = await app.inject({
    method: 'POST',
    url: '/imagenes',
    payload: {
      nombre: 'radiografia_01.jpg',
      url: 'https://example.com/radiografia_01.jpg',
      fecha_creacion: '2026-08-16',
    },
  });

  assert.equal(created.statusCode, 201);
  const createdBody = created.json();
  assert.equal(createdBody.nombre, 'radiografia_01.jpg');

  const list = await app.inject({ method: 'GET', url: '/imagenes' });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().length, 1);

  const byId = await app.inject({ method: 'GET', url: `/imagenes/${createdBody.id}` });
  assert.equal(byId.statusCode, 200);
  assert.equal(byId.json().url, 'https://example.com/radiografia_01.jpg');

  const updated = await app.inject({
    method: 'PUT',
    url: `/imagenes/${createdBody.id}`,
    payload: {
      nombre: 'radiografia_02.jpg',
      url: 'https://example.com/radiografia_02.jpg',
      fecha_creacion: '2026-08-17',
    },
  });

  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().nombre, 'radiografia_02.jpg');

  const removed = await app.inject({ method: 'DELETE', url: `/imagenes/${createdBody.id}` });
  assert.equal(removed.statusCode, 204);

  const missing = await app.inject({ method: 'GET', url: `/imagenes/${createdBody.id}` });
  assert.equal(missing.statusCode, 404);
});

test('Imagen: id inexistente retorna 404', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/imagenes/999' });
  assert.equal(response.statusCode, 404);
});

test('Imagen: validación de datos inválidos devuelve 400', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/imagenes',
    payload: { invalido: true },
  });

  assert.equal(response.statusCode, 400);
});

test('Imagen: actualizar id inexistente devuelve 404', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'PUT',
    url: '/imagenes/999',
    payload: {
      nombre: 'x.jpg',
      url: 'https://example.com/x.jpg',
      fecha_creacion: '2026-08-16',
    },
  });
  assert.equal(response.statusCode, 404);
});

test('Imagen: eliminar id inexistente devuelve 404', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'DELETE', url: '/imagenes/999' });
  assert.equal(response.statusCode, 404);
});

test('Imagen: PATCH actualiza parcialmente una imagen', async () => {
  const app = await buildApp();

  const created = await app.inject({
    method: 'POST',
    url: '/imagenes',
    payload: {
      nombre: 'radiografia_01.jpg',
      url: 'https://example.com/radiografia_01.jpg',
      fecha_creacion: '2026-08-16',
    },
  });

  assert.equal(created.statusCode, 201);

  const id = created.json().id;

  const patched = await app.inject({
    method: 'PATCH',
    url: `/imagenes/${id}`,
    payload: {
      nombre: 'radiografia_actualizada.jpg',
    },
  });

  assert.equal(patched.statusCode, 200);

  const body = patched.json();

  assert.equal(body.nombre, 'radiografia_actualizada.jpg');
  assert.equal(body.url, 'https://example.com/radiografia_01.jpg');
  assert.equal(body.fecha_creacion, '2026-08-16');
});

test('Imagen: PATCH de id inexistente devuelve 404', async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: 'PATCH',
    url: '/imagenes/999',
    payload: {
      nombre: 'x.jpg',
    },
  });

  assert.equal(response.statusCode, 404);
});

test('Imagen: QUERY por nombre y fecha_creacion', async () => {
  const app = await buildApp();

  await app.inject({
    method: 'POST',
    url: '/imagenes',
    payload: {
      nombre: 'radiografia_01.jpg',
      url: 'https://example.com/radiografia_01.jpg',
      fecha_creacion: '2026-08-16',
    },
  });

  const byNombre = await app.inject({
    method: 'QUERY',
    url: '/imagenes',
    payload: { nombre: 'radiografia' },
  });
  assert.equal(byNombre.statusCode, 200);
  assert.equal(byNombre.json().length, 1);

  const byFecha = await app.inject({
    method: 'QUERY',
    url: '/imagenes',
    payload: { fecha_creacion: '2026-08-16' },
  });
  assert.equal(byFecha.statusCode, 200);
  assert.equal(byFecha.json().length, 1);

  const sinFiltros = await app.inject({
    method: 'QUERY',
    url: '/imagenes',
    payload: {},
  });
  assert.equal(sinFiltros.statusCode, 200);
  assert.equal(sinFiltros.json().length, 1);
});