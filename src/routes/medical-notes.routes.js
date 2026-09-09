const {
  listNotasMedicas,
  getNotaMedicaById,
  createNotaMedica,
  updateNotaMedica,
  patchNotaMedica, 
  deleteNotaMedica,
  queryNotasMedicas,
} = require('../controllers/medical-notes.controller');
const {
  notaMedicaSchema,
  notaMedicaInputSchema,
  notaMedicaPatchSchema,
  notaMedicaQuerySchema,
  idParamSchema,
} = require('../schemas/medical-notes.schema');

async function notasMedicasRoutes(app) {
  app.get('/notas-medicas', {
    schema: {
      tags: ['NotasMedicas'],
      response: {
        200: { type: 'array', items: notaMedicaSchema },
      },
    },
  }, async () => listNotasMedicas());

  app.get('/notas-medicas/:id', {
    schema: {
      tags: ['NotasMedicas'],
      params: idParamSchema,
      response: {
        200: notaMedicaSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const nota = await getNotaMedicaById(request.params.id);
    if (!nota) {
      return reply.code(404).send({ error: 'Nota médica no encontrada' });
    }
    return nota;
  });

  app.post('/notas-medicas', {
    schema: {
      tags: ['NotasMedicas'],
      body: notaMedicaInputSchema,
      response: {
        201: notaMedicaSchema,
      },
    },
  }, async (request, reply) => {
    const nota = await createNotaMedica(request.body);
    reply.code(201);
    return nota;
  });

  app.put('/notas-medicas/:id', {
    schema: {
      tags: ['NotasMedicas'],
      params: idParamSchema,
      body: notaMedicaInputSchema,
      response: {
        200: notaMedicaSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const nota = await updateNotaMedica(request.params.id, request.body);
    if (!nota) {
      return reply.code(404).send({ error: 'Nota médica no encontrada' });
    }
    return nota;
  });

  app.patch('/notas-medicas/:id', {
    schema: {
      tags: ['NotasMedicas'],
      params: idParamSchema,
      body: notaMedicaPatchSchema,
      response: {
        200: notaMedicaSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const nota = await patchNotaMedica(request.params.id, request.body);

    if (!nota) {
      return reply.code(404).send({ error: 'Nota médica no encontrada' });
    }

    return nota;
  });

  app.delete('/notas-medicas/:id', {
    schema: {
      tags: ['NotasMedicas'],
      params: idParamSchema,
      response: {
        204: { type: 'null' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const deleted = await deleteNotaMedica(request.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Nota médica no encontrada' });
    }
    return reply.code(204).send();
  });

  app.route({
    method: 'QUERY',
    url: '/notas-medicas',
    schema: {
      tags: ['NotasMedicas'],
      body: notaMedicaQuerySchema,
      response: {
        200: { type: 'array', items: notaMedicaSchema },
      },
    },
    handler: async (request) => queryNotasMedicas(request.body || {}),
  });
}

module.exports = notasMedicasRoutes;
