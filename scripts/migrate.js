require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATION_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '001_initial_schema.sql');

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Configure the database connection in the environment.');
  }

  const migrationSql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const isSupabase = databaseUrl.includes('supabase.com');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: isSupabase ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log(`Ejecutando migración: ${path.basename(MIGRATION_FILE)}`);
    await pool.query(migrationSql);
    console.log('Migración completada correctamente.');
  } finally {
    await pool.end();
  }
}

runMigration().catch((error) => {
  console.error('Error al ejecutar la migración:', error.message);
  process.exit(1);
});