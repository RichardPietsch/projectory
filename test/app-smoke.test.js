const test = require('node:test');
const assert = require('node:assert/strict');

const { app, pool, startServer } = require('../src/app');

test('app module exports app and startServer', () => {
  assert.equal(typeof app, 'function');
  assert.equal(typeof startServer, 'function');
});

test('GET /health returns ok when db query succeeds', async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [{ ok: 1 }] });

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { status: 'ok' });
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});

test('GET /api/meta returns priority/trade/level payload', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('FROM priorities')) return { rows: [{ id: 1, name: 'P1' }] };
    if (sql.includes('FROM trades')) return { rows: [{ id: 2, name: 'UX' }] };
    if (sql.includes('FROM levels')) return { rows: [{ id: 3, name: 'SENIOR' }] };
    return { rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/meta`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, {
      priorities: [{ id: 1, name: 'P1' }],
      trades: [{ id: 2, name: 'UX' }],
      levels: [{ id: 3, name: 'SENIOR' }]
    });
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});

test('POST /api/people validates required fields', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/people`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'A' })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'firstName, lastName, tradeId and levelId are required.');
  } finally {
    server.close();
  }
});

test('POST /api/people creates person and returns id', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('INSERT INTO people')) {
      return { rows: [{ id: 42 }] };
    }
    return { rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/people`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Ada',
        lastName: 'Lovelace',
        tradeId: 1,
        levelId: 2,
        workingHours: 40
      })
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.deepEqual(body, { id: 42 });
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});
