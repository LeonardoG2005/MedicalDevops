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

async function patchImagen(id, payload) {
  const fields = [];
  const values = [];

  if (payload.nombre !== undefined) {
    fields.push(`nombre = $${values.length + 1}`);
    values.push(payload.nombre);
  }

  if (payload.url !== undefined) {
    fields.push(`url = $${values.length + 1}`);
    values.push(payload.url);
  }

  if (payload.fecha_creacion !== undefined) {
    fields.push(`fecha_creacion = $${values.length + 1}`);
    values.push(payload.fecha_creacion);
  }

  if (fields.length === 0) {
    return null;
  }

  values.push(id);

  const result = await query(
    `UPDATE imagenes
     SET ${fields.join(', ')}
     WHERE id = $${values.length}
     RETURNING *`,
    values,
  );

  return result.rows[0] || null;
}

async function deleteImagen(id) {
  const result = await query('DELETE FROM imagenes WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

async function queryImagenes(filters = {}) {
  const { nombre, fecha_creacion } = filters;
  const clauses = [];
  const values = [];

  if (nombre) {
    clauses.push(`nombre ILIKE $${values.length + 1}`);
    values.push(`%${nombre}%`);
  }

  if (fecha_creacion) {
    clauses.push(`fecha_creacion = $${values.length + 1}`);
    values.push(fecha_creacion);
  }

  let sql = 'SELECT * FROM imagenes';

  if (clauses.length > 0) {
    sql += ` WHERE ${clauses.join(' AND ')}`;
  }

  sql += ' ORDER BY id ASC';

  const result = await query(sql, values);

  return result.rows;
}

module.exports = {
  listImagenes,
  getImagenById,
  createImagen,
  patchImagen,
  updateImagen,
  deleteImagen,
  queryImagenes,
};
