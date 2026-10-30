const {
  listNotasMedicasV3,
  createNotaMedicaV3,
  setPrioridad,
} = require('./notes.controller');
const { getResumenImagen } = require('./resumen.controller');
const {
  prioridadSchema,
  notaMedicaV3Schema,
  notaMedicaV3InputSchema,
  prioridadBodySchema,
  idParamSchema,
  errorSchema,
} = require('./schemas');

async function v3Routes(app) {
  app.get('/api/v3/notas-medicas', {
    schema: {
      tags: ['V3'],
      querystring: { type: 'object', properties: { prioridad: prioridadSchema } },
      response: { 200: { type: 'array', items: notaMedicaV3Schema } },
    },
  }, async (request) => listNotasMedicasV3(request.query.prioridad));

  app.post('/api/v3/notas-medicas', {
    schema: {
      tags: ['V3'],
      body: notaMedicaV3InputSchema,
      response: { 201: notaMedicaV3Schema },
    },
  }, async (request, reply) => {
    const nota = await createNotaMedicaV3(request.body);
    reply.code(201);
    return nota;
  });

  app.patch('/api/v3/notas-medicas/:id/prioridad', {
    schema: {
      tags: ['V3'],
      params: idParamSchema,
      body: prioridadBodySchema,
      response: { 200: notaMedicaV3Schema, 404: errorSchema },
    },
  }, async (request, reply) => {
    const nota = await setPrioridad(request.params.id, request.body.prioridad);
    if (!nota) {
      return reply.code(404).send({ error: 'Nota médica no encontrada' });
    }
    return nota;
  });

  app.get('/api/v3/imagenes/:id/resumen', {
    schema: {
      tags: ['V3'],
      params: idParamSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            imagen_id: { type: 'integer' },
            notas_totales: { type: 'integer' },
            prioridad_maxima: { type: ['string', 'null'] },
            documentos_totales: { type: 'integer' },
          },
        },
        404: errorSchema,
      },
    },
  }, async (request, reply) => {
    const resumen = await getResumenImagen(request.params.id);
    if (!resumen) {
      return reply.code(404).send({ error: 'Imagen no encontrada' });
    }
    return resumen;
  });
}

module.exports = v3Routes;
