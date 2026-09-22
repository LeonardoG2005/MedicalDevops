const { getImagenById } = require('../../controllers/images.controller');
const { getNotaMedicaById } = require('../../controllers/medical-notes.controller');
const { getDocumentoGeneradoById } = require('../../controllers/generated-documents.controller');
const { createCompositionHandler } = require('../controllers/composition.controller');
const { createOrchestratorClient } = require('../services/orchestrator-client');

async function v2Routes(app, options) {
  const getExternal = options.orchestratorClient || createOrchestratorClient({
    baseUrl: options.orchestratorUrl || process.env.ORCHESTRATOR_URL,
  });

  app.get('/api/v2/imagenes/:id/composition', async (request, reply) => createCompositionHandler({
    getLocal: getImagenById,
    getExternal,
    localKey: 'imagen',
  })(request, reply));

  app.get('/api/v2/notas-medicas/:id/composition', async (request, reply) => createCompositionHandler({
    getLocal: getNotaMedicaById,
    getExternal,
    localKey: 'notaMedica',
  })(request, reply));

  app.get('/api/v2/documentos-generados/:id/composition', async (request, reply) => createCompositionHandler({
    getLocal: getDocumentoGeneradoById,
    getExternal,
    localKey: 'documentoGenerado',
  })(request, reply));
}

module.exports = v2Routes;