const {
  listDocumentosGenerados,
  getDocumentoGeneradoById,
  createDocumentoGenerado,
  updateDocumentoGenerado,
  deleteDocumentoGenerado,
} = require('../controllers/generated-documents.controller');
const {
  documentoGeneradoSchema,
  documentoGeneradoInputSchema,
  idParamSchema,
} = require('../schemas/generated-documents.schema');

async function documentosGeneradosRoutes(app) {
  app.get('/documentos-generados', {
    schema: {
      tags: ['DocumentosGenerados'],
      response: {
        200: { type: 'array', items: documentoGeneradoSchema },
      },
    },
  }, async () => listDocumentosGenerados());

  app.get('/documentos-generados/:id', {
    schema: {
      tags: ['DocumentosGenerados'],
      params: idParamSchema,
      response: {
        200: documentoGeneradoSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const documento = await getDocumentoGeneradoById(request.params.id);
    if (!documento) {
      return reply.code(404).send({ error: 'Documento no encontrado' });
    }
    return documento;
  });

  app.post('/documentos-generados', {
    schema: {
      tags: ['DocumentosGenerados'],
      body: documentoGeneradoInputSchema,
      response: {
        201: documentoGeneradoSchema,
      },
    },
  }, async (request, reply) => {
    const documento = await createDocumentoGenerado(request.body);
    reply.code(201);
    return documento;
  });

  app.put('/documentos-generados/:id', {
    schema: {
      tags: ['DocumentosGenerados'],
      params: idParamSchema,
      body: documentoGeneradoInputSchema,
      response: {
        200: documentoGeneradoSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const documento = await updateDocumentoGenerado(request.params.id, request.body);
    if (!documento) {
      return reply.code(404).send({ error: 'Documento no encontrado' });
    }
    return documento;
  });

  app.delete('/documentos-generados/:id', {
    schema: {
      tags: ['DocumentosGenerados'],
      params: idParamSchema,
      response: {
        204: { type: 'null' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const deleted = await deleteDocumentoGenerado(request.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Documento no encontrado' });
    }
    return reply.code(204).send();
  });
}

module.exports = documentosGeneradosRoutes;
