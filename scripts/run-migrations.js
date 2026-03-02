const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

// SQL migration files are applied in lexical order from this folder.
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');
const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';

function createPool() {
  return new Pool({
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'helloapp',
    user: process.env.DB_USER || 'hello',
    password: process.env.DB_PASSWORD || 'hello'
  });
}

// Persist migration history so each version is applied exactly once.
async function ensureMigrationsTable(pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
}

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function getAppliedVersions(pool) {
  const result = await pool.query(`SELECT version FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY version`);
  return new Set(result.rows.map((row) => row.version));
}

// Apply one migration inside a transaction for all-or-nothing safety.
async function applyMigration(pool, version) {
  const migrationPath = path.join(MIGRATIONS_DIR, version);
  const sql = await fs.readFile(migrationPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(`INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (version) VALUES ($1)`, [version]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// CLI modes: default applies pending migrations, --status only reports state.
async function run() {
  const mode = process.argv[2] === '--status' ? 'status' : 'apply';
  const pool = createPool();

  try {
    await ensureMigrationsTable(pool);
    const files = await listMigrationFiles();
    const applied = await getAppliedVersions(pool);
    const pending = files.filter((file) => !applied.has(file));

    if (mode === 'status') {
      console.log(`Applied migrations: ${applied.size}`);
      console.log(`Pending migrations: ${pending.length}`);
      for (const version of pending) {
        console.log(`  - ${version}`);
      }
      return;
    }

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    for (const version of pending) {
      console.log(`Applying migration ${version} ...`);
      await applyMigration(pool, version);
      console.log(`Applied migration ${version}.`);
    }

    console.log(`Done. Applied ${pending.length} migration(s).`);
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Migration run failed:', error.message);
  process.exitCode = 1;
});
