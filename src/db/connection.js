const { Pool } = require('pg');
const { databaseUrl } = require('../config');
const needsSsl = databaseUrl.includes('supabase.com'); // mejor usar el mismo criterio que migrate.js

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

module.exports = {
  pool,
  query: (...args) => pool.query(...args),
};

