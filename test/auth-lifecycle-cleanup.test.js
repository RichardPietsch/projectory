const test = require('node:test');
const assert = require('node:assert/strict');

const { app, pool, clearMetrics, cleanupAuthLifecycleArtifacts } = require('../src/app');

test('cleanupAuthLifecycleArtifacts deletes stale lifecycle rows using expected retention windows', async () => {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    if (String(sql).includes('DELETE FROM auth_sessions')) return { rowCount: 2, rows: [] };
    if (String(sql).includes('DELETE FROM password_reset_tokens')) return { rowCount: 3, rows: [] };
    if (String(sql).includes('DELETE FROM user_invites')) return { rowCount: 4, rows: [] };
    return { rowCount: 0, rows: [] };
  };

  try {
    await cleanupAuthLifecycleArtifacts();

    assert.equal(calls.filter((entry) => entry.sql.includes('DELETE FROM auth_sessions')).length, 1);
    assert.equal(calls.filter((entry) => entry.sql.includes('DELETE FROM password_reset_tokens')).length, 1);
    assert.equal(calls.filter((entry) => entry.sql.includes('DELETE FROM user_invites')).length, 1);

    assert.equal(calls.some((entry) => entry.sql.includes('DELETE FROM auth_sessions') && Number(entry.params?.[0]) === 24), true);
    assert.equal(calls.some((entry) => entry.sql.includes('DELETE FROM password_reset_tokens') && Number(entry.params?.[0]) === 168), true);
    assert.equal(calls.some((entry) => entry.sql.includes('DELETE FROM user_invites') && Number(entry.params?.[0]) === 168), true);
  } finally {
    pool.query = originalQuery;
    clearMetrics();
  }
});

test('cleanupAuthLifecycleArtifacts updates cleanup observability counters', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (String(sql).includes('DELETE FROM auth_sessions')) return { rowCount: 2, rows: [] };
    if (String(sql).includes('DELETE FROM password_reset_tokens')) return { rowCount: 3, rows: [] };
    if (String(sql).includes('DELETE FROM user_invites')) return { rowCount: 4, rows: [] };
    return { rowCount: 0, rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    await cleanupAuthLifecycleArtifacts();
    await cleanupAuthLifecycleArtifacts();

    const metricsResponse = await fetch(`http://127.0.0.1:${port}/metrics`);
    assert.equal(metricsResponse.status, 200);
    const text = await metricsResponse.text();

    assert.equal(text.includes('projectory_auth_lifecycle_cleanup_runs_total{outcome="success"} 2'), true);
    assert.equal(text.includes('projectory_auth_lifecycle_cleanup_deleted_rows_total{kind="auth_sessions"} 4'), true);
    assert.equal(text.includes('projectory_auth_lifecycle_cleanup_deleted_rows_total{kind="password_reset_tokens"} 6'), true);
    assert.equal(text.includes('projectory_auth_lifecycle_cleanup_deleted_rows_total{kind="user_invites"} 8'), true);
  } finally {
    server.close();
    pool.query = originalQuery;
    clearMetrics();
  }
});
