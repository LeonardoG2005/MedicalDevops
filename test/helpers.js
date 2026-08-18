require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

process.env.NODE_ENV = 'test';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for tests.');
}

const isSupabase = process.env.DATABASE_URL.includes('supabase.com');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
});

let schemaInitialized = false;

async function ensureSchema() {
  if (schemaInitialized) {
    return;
  }

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '001_initial_schema.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  await pool.query(migrationSql);
  schemaInitialized = true;
}

async function resetDatabase() {
  await ensureSchema();
  await pool.query('TRUNCATE TABLE documentos_generados, notas_medicas, imagenes RESTART IDENTITY CASCADE');
}

async function createImage(payload = {}) {
  const result = await pool.query(
    'INSERT INTO imagenes (nombre, url, fecha_creacion) VALUES ($1, $2, $3) RETURNING *',
    [
      payload.nombre || 'radiografia_01.jpg',
      payload.url || 'https://example.com/radiografia_01.jpg',
      payload.fecha_creacion || '2026-08-16',
    ],
  );

  return result.rows[0];
}

async function createNote(payload = {}) {
  const result = await pool.query(
    'INSERT INTO notas_medicas (paciente, contenido, fecha, imagen_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [
      payload.paciente || 'Paciente 001',
      payload.contenido || 'Dolor de cabeza.',
      payload.fecha || '2026-08-16',
      payload.imagen_id || 1,
    ],
  );

  return result.rows[0];
}

async function createDocument(payload = {}) {
  const result = await pool.query(
    'INSERT INTO documentos_generados (nombre, tipo, url, fecha_generacion, nota_medica_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [
      payload.nombre || 'reporte_001.pdf',
      payload.tipo || 'PDF',
      payload.url || 'https://example.com/reporte_001.pdf',
      payload.fecha_generacion || '2026-08-16',
      payload.nota_medica_id || 1,
    ],
  );

  return result.rows[0];
}

module.exports = {
  pool,
  resetDatabase,
  createImage,
  createNote,
  createDocument,
};
