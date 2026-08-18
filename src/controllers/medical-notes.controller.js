const { query } = require('../db/connection');

async function listNotasMedicas() {
  const result = await query('SELECT * FROM notas_medicas ORDER BY id ASC');
  return result.rows;
}

async function getNotaMedicaById(id) {
  const result = await query('SELECT * FROM notas_medicas WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createNotaMedica(payload) {
  const { paciente, contenido, fecha, imagen_id } = payload;
  const result = await query(
    'INSERT INTO notas_medicas (paciente, contenido, fecha, imagen_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [paciente, contenido, fecha, imagen_id],
  );
  return result.rows[0];
}

async function updateNotaMedica(id, payload) {
  const { paciente, contenido, fecha, imagen_id } = payload;
  const result = await query(
    'UPDATE notas_medicas SET paciente = $1, contenido = $2, fecha = $3, imagen_id = $4 WHERE id = $5 RETURNING *',
    [paciente, contenido, fecha, imagen_id, id],
  );
  return result.rows[0] || null;
}

async function deleteNotaMedica(id) {
  const result = await query('DELETE FROM notas_medicas WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

async function queryNotasMedicas(filters = {}) {
  const { paciente, fecha } = filters;
  const clauses = [];
  const values = [];

  if (paciente) {
    clauses.push(`paciente = $${values.length + 1}`);
    values.push(paciente);
  }

  if (fecha) {
    clauses.push(`fecha = $${values.length + 1}`);
    values.push(fecha);
  }

  let sql = 'SELECT * FROM notas_medicas';
  if (clauses.length > 0) {
    sql += ` WHERE ${clauses.join(' AND ')}`;
  }
  sql += ' ORDER BY id ASC';

  const result = await query(sql, values);
  return result.rows;
}

module.exports = {
  listNotasMedicas,
  getNotaMedicaById,
  createNotaMedica,
  updateNotaMedica,
  deleteNotaMedica,
  queryNotasMedicas,
};
