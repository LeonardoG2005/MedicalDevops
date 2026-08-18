const { listImagenes, getImagenById, createImagen, updateImagen, deleteImagen } = require('../controllers/imagenes.controller');
const { imagenSchema, imagenInputSchema, idParamSchema } = require('../schemas/imagenes.schema');

async function imagenesRoutes(app) {
  app.get('/imagenes', {
    schema: {
      tags: ['Imagenes'],
      response: {
        200: { type: 'array', items: imagenSchema },
      },
    },
  }, async () => listImagenes());

  app.get('/imagenes/:id', {
    schema: {
      tags: ['Imagenes'],
      params: idParamSchema,
      response: {
        200: imagenSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const imagen = await getImagenById(request.params.id);
    if (!imagen) {
      return reply.code(404).send({ error: 'Imagen no encontrada' });
    }
    return imagen;
  });

  app.post('/imagenes', {
    schema: {
      tags: ['Imagenes'],
      body: imagenInputSchema,
      response: {
        201: imagenSchema,
      },
    },
  }, async (request, reply) => {
    const imagen = await createImagen(request.body);
    reply.code(201);
    return imagen;
  });

  app.put('/imagenes/:id', {
    schema: {
      tags: ['Imagenes'],
      params: idParamSchema,
      body: imagenInputSchema,
      response: {
        200: imagenSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const imagen = await updateImagen(request.params.id, request.body);
    if (!imagen) {
      return reply.code(404).send({ error: 'Imagen no encontrada' });
    }
    return imagen;
  });

  app.delete('/imagenes/:id', {
    schema: {
      tags: ['Imagenes'],
      params: idParamSchema,
      response: {
        204: { type: 'null' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const deleted = await deleteImagen(request.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Imagen no encontrada' });
    }
    return reply.code(204).send();
  });
}

module.exports = imagenesRoutes;
