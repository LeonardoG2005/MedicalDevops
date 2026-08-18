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
