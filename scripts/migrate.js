require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

// Files run in name order (001, 002, ...). Every migration is idempotent and
// only adds things, so running the whole list again is safe.
function listMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => path.join(MIGRATIONS_DIR, file));
}

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Configure the database connection in the environment.');
  }

  const isSupabase = databaseUrl.includes('supabase.com');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: isSupabase ? { rejectUnauthorized: false } : false,
  });

  try {
    for (const file of listMigrations()) {
      console.log(`Ejecutando migración: ${path.basename(file)}`);
      await pool.query(fs.readFileSync(file, 'utf8'));
    }
    console.log('Migraciones completadas correctamente.');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations().catch((error) => {
    console.error('Error al ejecutar las migraciones:', error.message);
    process.exit(1);
  });
}

module.exports = { listMigrations };
