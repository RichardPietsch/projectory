const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

const shouldRun = process.env.RUN_DB_INTEGRATION === '1';

(shouldRun ? test : test.skip)('db integration: schema_migrations table exists after migrations', async () => {
  const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'helloapp',
    user: process.env.DB_USER || 'hello',
    password: process.env.DB_PASSWORD || 'hello'
  });

  try {
    const result = await pool.query("SELECT to_regclass('public.schema_migrations') AS table_name");
    assert.equal(result.rows[0].table_name, 'schema_migrations');
  } finally {
    await pool.end();
  }
});
