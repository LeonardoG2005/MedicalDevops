const {
  listNotasMedicasV3,
  createNotaMedicaV3,
  setPrioridad,
} = require('./notes.controller');
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
}

module.exports = v3Routes;
