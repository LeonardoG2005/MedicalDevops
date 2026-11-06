const {
  listNotasMedicasV4,
  createNotaMedicaV4,
  setPrioridad,
} = require('./notes.controller');
const { getResumenImagen } = require('./resumen.controller');
const {
  prioridadSchema,
  notaMedicaV4Schema,
  notaMedicaV4InputSchema,
  prioridadBodySchema,
  idParamSchema,
  errorSchema,
} = require('./schemas');

async function v4Routes(app) {
  app.get('/api/v4/notas-medicas', {
    schema: {
      tags: ['V4'],
      querystring: { type: 'object', properties: { prioridad: prioridadSchema } },
      response: { 200: { type: 'array', items: notaMedicaV4Schema } },
    },
  }, async (request) => listNotasMedicasV4(request.query.prioridad));

  app.post('/api/v4/notas-medicas', {
    schema: {
      tags: ['V4'],
      body: notaMedicaV4InputSchema,
      response: { 201: notaMedicaV4Schema },
    },
  }, async (request, reply) => {
    const nota = await createNotaMedicaV4(request.body);
    reply.code(201);
    return nota;
  });

  app.patch('/api/v4/notas-medicas/:id/prioridad', {
    schema: {
      tags: ['V4'],
      params: idParamSchema,
      body: prioridadBodySchema,
      response: { 200: notaMedicaV4Schema, 404: errorSchema },
    },
  }, async (request, reply) => {
    const nota = await setPrioridad(request.params.id, request.body.prioridad);
    if (!nota) {
      return reply.code(404).send({ error: 'Nota médica no encontrada' });
    }
    return nota;
  });

  app.get('/api/v4/imagenes/:id/resumen', {
    schema: {
      tags: ['V4'],
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

module.exports = v4Routes;
