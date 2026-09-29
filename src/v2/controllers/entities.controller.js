const {
  listImagenes,
  getImagenById,
} = require('../../controllers/images.controller');

const {
  listNotasMedicas,
} = require('../../controllers/medical-notes.controller');

const {
  listDocumentosGenerados,
} = require('../../controllers/generated-documents.controller');

const {
  getVueloRandom,
  getAnimalRandom,
} = require('../services/peer-client');

function getRandomItem(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * items.length);

  return items[randomIndex];
}


async function getRandomImagen(request, reply) {
  try {
    const imagenes = await listImagenes();

    const imagen = getRandomItem(imagenes);

    if (!imagen) {
      return reply.code(404).send({
        error: 'No hay imágenes disponibles',
      });
    }

    return reply.send(imagen);
  } catch (error) {
    request.log.error(error);

    return reply.code(500).send({
      error: 'Error obteniendo una imagen aleatoria',
    });
  }
}

async function getRandomNotaMedica(request, reply) {
  try {
    const notasMedicas = await listNotasMedicas();

    const notaMedica = getRandomItem(notasMedicas);

    if (!notaMedica) {
      return reply.code(404).send({
        error: 'No hay notas médicas disponibles',
      });
    }

    return reply.send(notaMedica);
  } catch (error) {
    request.log.error(error);

    return reply.code(500).send({
      error: 'Error obteniendo una nota médica aleatoria',
    });
  }
}

async function getRandomDocumentoGenerado(request, reply) {
  try {
    const documentosGenerados = await listDocumentosGenerados();

    const documentoGenerado = getRandomItem(documentosGenerados);

    if (!documentoGenerado) {
      return reply.code(404).send({
        error: 'No hay documentos generados disponibles',
      });
    }

    return reply.send(documentoGenerado);
  } catch (error) {
    request.log.error(error);

    return reply.code(500).send({
      error: 'Error obteniendo un documento generado aleatorio',
    });
  }
}


async function getImagenByIdWithPeers(request, reply) {
  const { id } = request.params;

  try {
    // 1. Buscar la imagen en nuestra propia base de datos
    const imagen = await getImagenById(id);

    if (!imagen) {
      return reply.code(404).send({
        error: 'Imagen no encontrada',
      });
    }

    // 2. Consultar directamente las APIs de los compañeros
    const [vuelo, animal] = await Promise.all([
      getVueloRandom(request),
      getAnimalRandom(request),
    ]);

    // 3. Devolver la composición
    return reply.send({
      imagen,
      vuelo,
      animal,
    });
  } catch (error) {
    request.log.error(error);

    return reply.code(502).send({
      error: 'Error consultando las APIs de los compañeros',
      message: error.message,
    });
  }
}

module.exports = {
  getRandomImagen,
  getRandomNotaMedica,
  getRandomDocumentoGenerado,
  getImagenByIdWithPeers,
};