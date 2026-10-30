const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');
const { resetDatabase, createImage } = require('./helpers');

test.beforeEach(async () => {
  await resetDatabase();
});

test('V3: crea una nota con prioridad obligatoria', async () => {
  const app = await buildApp();
  const image = await createImage();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v3/notas-medicas',
    payload: {
      paciente: 'Paciente 030',
      contenido: 'Dolor torácico agudo.',
      fecha: '2026-08-16',
      imagen_id: image.id,
      prioridad: 'alta',
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().prioridad, 'alta');
});

test('V3: rechaza una prioridad fuera del catálogo', async () => {
  const app = await buildApp();
  const image = await createImage();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v3/notas-medicas',
    payload: {
      paciente: 'Paciente 031',
      contenido: 'Revisión.',
      fecha: '2026-08-16',
      imagen_id: image.id,
      prioridad: 'urgente',
    },
  });

  assert.equal(response.statusCode, 400);
});

test('V3: lista y filtra por prioridad, incluyendo notas antiguas sin prioridad', async () => {
  const app = await buildApp();
  const image = await createImage();

  await app.inject({ method: 'POST', url: '/notas-medicas', payload: {
    paciente: 'Antigua', contenido: 'Sin prioridad.', fecha: '2026-08-16', imagen_id: image.id,
  } });
  await app.inject({ method: 'POST', url: '/api/v3/notas-medicas', payload: {
    paciente: 'Nueva', contenido: 'Con prioridad.', fecha: '2026-08-16', imagen_id: image.id, prioridad: 'critica',
  } });

  const todas = await app.inject({ method: 'GET', url: '/api/v3/notas-medicas' });
  assert.equal(todas.json().length, 2);
  assert.equal(todas.json().find((nota) => nota.paciente === 'Antigua').prioridad, null);

  const filtradas = await app.inject({ method: 'GET', url: '/api/v3/notas-medicas?prioridad=critica' });
  assert.equal(filtradas.json().length, 1);
  assert.equal(filtradas.json()[0].paciente, 'Nueva');
});

test('V3: PATCH de prioridad actualiza una nota existente de v1', async () => {
  const app = await buildApp();
  const image = await createImage();

  const creada = await app.inject({ method: 'POST', url: '/notas-medicas', payload: {
    paciente: 'Paciente 032', contenido: 'Seguimiento.', fecha: '2026-08-16', imagen_id: image.id,
  } });

  const actualizada = await app.inject({
    method: 'PATCH',
    url: `/api/v3/notas-medicas/${creada.json().id}/prioridad`,
    payload: { prioridad: 'baja' },
  });

  assert.equal(actualizada.statusCode, 200);
  assert.equal(actualizada.json().prioridad, 'baja');
});

test('V3: PATCH de prioridad sobre un id inexistente devuelve 404', async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: 'PATCH',
    url: '/api/v3/notas-medicas/999/prioridad',
    payload: { prioridad: 'baja' },
  });

  assert.equal(response.statusCode, 404);
});
