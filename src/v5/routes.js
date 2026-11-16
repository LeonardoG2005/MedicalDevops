const { createFlujoHandlers } = require('./flujo.controller');
const {
  idParamSchema,
  flujoResponseSchema,
  flujoErrorSchema,
  notFoundSchema,
} = require('./schemas');

// options: { caller, faults, metrics } built once in buildApp so every test
// can inject its own timeouts, breaker thresholds and fault cache
async function v5Routes(app, options) {
  const handlers = createFlujoHandlers(options);
  const responses = { 200: flujoResponseSchema, 404: notFoundSchema, 502: flujoErrorSchema };

  app.get('/api/v5/flujo/random', {
    schema: {
      tags: ['V5'],
      summary: 'Flujo multicloud sobre una imagen aleatoria (usado por k6)',
      response: responses,
    },
  }, handlers.flujoRandom);

  app.get('/api/v5/flujo/:imagenId', {
    schema: {
      tags: ['V5'],
      summary: 'Flujo multicloud: imagen local, animal de Angel (AWS) y vuelo de Juan (OCI), en cadena',
      params: idParamSchema,
      response: responses,
    },
  }, handlers.flujoPorImagen);
}

module.exports = v5Routes;
