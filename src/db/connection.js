const { Pool } = require('pg');
const { databaseUrl } = require('../config');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

module.exports = {
  pool,
  query: (...args) => pool.query(...args),
};
