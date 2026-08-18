const { query } = require('../db/connection');

async function listDocumentosGenerados() {
  const result = await query('SELECT * FROM documentos_generados ORDER BY id ASC');
  return result.rows;
}

async function getDocumentoGeneradoById(id) {
  const result = await query('SELECT * FROM documentos_generados WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createDocumentoGenerado(payload) {
  const { nombre, tipo, url, fecha_generacion, nota_medica_id } = payload;
  const result = await query(
    'INSERT INTO documentos_generados (nombre, tipo, url, fecha_generacion, nota_medica_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [nombre, tipo, url, fecha_generacion, nota_medica_id],
  );
  return result.rows[0];
}

async function updateDocumentoGenerado(id, payload) {
  const { nombre, tipo, url, fecha_generacion, nota_medica_id } = payload;
  const result = await query(
    'UPDATE documentos_generados SET nombre = $1, tipo = $2, url = $3, fecha_generacion = $4, nota_medica_id = $5 WHERE id = $6 RETURNING *',
    [nombre, tipo, url, fecha_generacion, nota_medica_id, id],
  );
  return result.rows[0] || null;
}

async function deleteDocumentoGenerado(id) {
  const result = await query('DELETE FROM documentos_generados WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = {
  listDocumentosGenerados,
  getDocumentoGeneradoById,
  createDocumentoGenerado,
  updateDocumentoGenerado,
  deleteDocumentoGenerado,
};
