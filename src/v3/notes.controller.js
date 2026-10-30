const { query } = require('../db/connection');

const COLUMNS = 'id, paciente, contenido, fecha, imagen_id, prioridad';

async function listNotasMedicasV3(prioridad) {
  if (prioridad) {
    const result = await query(
      `SELECT ${COLUMNS} FROM notas_medicas WHERE prioridad = $1 ORDER BY id ASC`,
      [prioridad],
    );
    return result.rows;
  }
  const result = await query(`SELECT ${COLUMNS} FROM notas_medicas ORDER BY id ASC`);
  return result.rows;
}

async function createNotaMedicaV3({ paciente, contenido, fecha, imagen_id, prioridad }) {
  const result = await query(
    `INSERT INTO notas_medicas (paciente, contenido, fecha, imagen_id, prioridad)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [paciente, contenido, fecha, imagen_id, prioridad],
  );
  return result.rows[0];
}

async function setPrioridad(id, prioridad) {
  const result = await query(
    `UPDATE notas_medicas SET prioridad = $1 WHERE id = $2 RETURNING ${COLUMNS}`,
    [prioridad, id],
  );
  return result.rows[0] || null;
}

module.exports = { listNotasMedicasV3, createNotaMedicaV3, setPrioridad };
