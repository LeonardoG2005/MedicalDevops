const { query } = require('../db/connection');

// Explicit rank so "critica" always wins over "alta" regardless of insert order
const RANGO_PRIORIDAD = `CASE prioridad
  WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 WHEN 'baja' THEN 1 ELSE 0 END`;

async function getResumenImagen(imagenId) {
  const imagen = await query('SELECT id FROM imagenes WHERE id = $1', [imagenId]);
  if (!imagen.rows[0]) {
    return null;
  }

  const notas = await query(
    `SELECT COUNT(*)::int AS total,
            (SELECT prioridad FROM notas_medicas
             WHERE imagen_id = $1 AND prioridad IS NOT NULL
             ORDER BY ${RANGO_PRIORIDAD} DESC LIMIT 1) AS prioridad_maxima
     FROM notas_medicas WHERE imagen_id = $1`,
    [imagenId],
  );

  const documentos = await query(
    `SELECT COUNT(*)::int AS total FROM documentos_generados
     WHERE nota_medica_id IN (SELECT id FROM notas_medicas WHERE imagen_id = $1)`,
    [imagenId],
  );

  return {
    imagen_id: imagenId,
    notas_totales: notas.rows[0].total,
    prioridad_maxima: notas.rows[0].prioridad_maxima,
    documentos_totales: documentos.rows[0].total,
  };
}

module.exports = { getResumenImagen };
