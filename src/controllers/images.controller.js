const { query } = require('../db/connection');

async function listImagenes() {
  const result = await query('SELECT * FROM imagenes ORDER BY id ASC');
  return result.rows;
}

async function getImagenById(id) {
  const result = await query('SELECT * FROM imagenes WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createImagen(payload) {
  const { nombre, url, fecha_creacion } = payload;
  const result = await query(
    'INSERT INTO imagenes (nombre, url, fecha_creacion) VALUES ($1, $2, $3) RETURNING *',
    [nombre, url, fecha_creacion],
  );
  return result.rows[0];
}

async function updateImagen(id, payload) {
  const { nombre, url, fecha_creacion } = payload;
  const result = await query(
    'UPDATE imagenes SET nombre = $1, url = $2, fecha_creacion = $3 WHERE id = $4 RETURNING *',
    [nombre, url, fecha_creacion, id],
  );
  return result.rows[0] || null;
}

async function deleteImagen(id) {
  const result = await query('DELETE FROM imagenes WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = {
  listImagenes,
  getImagenById,
  createImagen,
  updateImagen,
  deleteImagen,
};
