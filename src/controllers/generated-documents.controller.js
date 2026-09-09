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

async function patchDocumentoGenerado(id, payload) {
  const fields = [];
  const values = [];

  if (payload.nombre !== undefined) {
    fields.push(`nombre = $${values.length + 1}`);
    values.push(payload.nombre);
  }

  if (payload.tipo !== undefined) {
    fields.push(`tipo = $${values.length + 1}`);
    values.push(payload.tipo);
  }

  if (payload.url !== undefined) {
    fields.push(`url = $${values.length + 1}`);
    values.push(payload.url);
  }

  if (payload.fecha_generacion !== undefined) {
    fields.push(`fecha_generacion = $${values.length + 1}`);
    values.push(payload.fecha_generacion);
  }

  if (payload.nota_medica_id !== undefined) {
    fields.push(`nota_medica_id = $${values.length + 1}`);
    values.push(payload.nota_medica_id);
  }

  if (fields.length === 0) {
    return null;
  }

  values.push(id);

  const result = await query(
    `UPDATE documentos_generados
     SET ${fields.join(', ')}
     WHERE id = $${values.length}
     RETURNING *`,
    values,
  );

  return result.rows[0] || null;
}

async function deleteDocumentoGenerado(id) {
  const result = await query('DELETE FROM documentos_generados WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

async function queryDocumentosGenerados(filters = {}) {
  const {
    nombre,
    tipo,
    fecha_generacion,
    nota_medica_id,
  } = filters;

  const clauses = [];
  const values = [];

  if (nombre) {
    clauses.push(`nombre ILIKE $${values.length + 1}`);
    values.push(`%${nombre}%`);
  }

  if (tipo) {
    clauses.push(`tipo = $${values.length + 1}`);
    values.push(tipo);
  }

  if (fecha_generacion) {
    clauses.push(`fecha_generacion = $${values.length + 1}`);
    values.push(fecha_generacion);
  }

  if (nota_medica_id !== undefined) {
    clauses.push(`nota_medica_id = $${values.length + 1}`);
    values.push(nota_medica_id);
  }

  let sql = 'SELECT * FROM documentos_generados';

  if (clauses.length > 0) {
    sql += ` WHERE ${clauses.join(' AND ')}`;
  }

  sql += ' ORDER BY id ASC';

  const result = await query(sql, values);

  return result.rows;
}

module.exports = {
  listDocumentosGenerados,
  getDocumentoGeneradoById,
  createDocumentoGenerado,
  updateDocumentoGenerado,
  patchDocumentoGenerado,
  deleteDocumentoGenerado,
  queryDocumentosGenerados,
};
