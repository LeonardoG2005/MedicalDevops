const {
  getRandomImagen,
  getRandomNotaMedica,
  getRandomDocumentoGenerado,
  getImagenByIdWithPeers,
} = require('../controllers/entities.controller');

async function v2Routes(app, options) {

  app.get('/api/v2/imagenes/random', getRandomImagen);

  app.get('/api/v2/notas-medicas/random', getRandomNotaMedica);

  app.get(
    '/api/v2/documentos-generados/random',
    getRandomDocumentoGenerado
  );

  app.get(
    '/api/v2/imagenes/:id',
    getImagenByIdWithPeers
  );
}

module.exports = v2Routes;