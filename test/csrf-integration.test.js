const test = require('node:test');
const assert = require('node:assert/strict');

const { app, pool } = require('../src/app');

function installSessionPoolMock() {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;

  pool.query = async (sql, params = []) => {
    const text = String(sql);

    if (text.includes('FROM auth_sessions s')) {
      return {
        rowCount: 1,
        rows: [{
          session_id: 'session-abc',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          revoked_at: null,
          user_id: 1,
          email: 'admin@example.com',
          display_name: 'Admin',
          person_id: null,
          roles: ['admin'],
          db_permissions: [],
          scoped_project_ids: []
        }]
      };
    }

    if (text.includes('UPDATE auth_sessions') && text.includes('last_seen_at')) {
      return { rowCount: 1, rows: [] };
    }

    if (text.includes('SELECT id, name') && text.includes('FROM roles')) {
      return { rowCount: 1, rows: [{ id: 1, name: 'admin' }] };
    }

    if (text.includes('INSERT INTO users')) {
      return { rowCount: 1, rows: [{ id: 42 }] };
    }

    if (text.includes('INSERT INTO user_roles')) {
      return { rowCount: 1, rows: [] };
    }

    if (text.includes('INSERT INTO rate_limit_buckets') || text.includes('DELETE FROM rate_limit_buckets')) {
      throw new Error('rate-limit db unavailable for test fallback');
    }

    return { rowCount: 0, rows: [] };
  };

  pool.connect = async () => ({
    query: pool.query,
    release() {}
  });

  return () => {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  };
}

async function getCsrfToken(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/csrf-token`, {
    headers: { cookie: 'projectory_session=session-abc' }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return String(body.token || '');
}

async function withServer(run) {
  const restore = installSessionPoolMock();
  const server = app.listen(0);
  const port = server.address().port;
  try {
    await run(port);
  } finally {
    server.close();
    restore();
  }
}

test('csrf integration: POST /api/admin/users rejects missing token', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'projectory_session=session-abc'
      },
      body: JSON.stringify({ email: 'new-admin@example.com', displayName: 'New Admin', role: 'admin' })
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'CSRF token missing.');
  });
});

test('csrf integration: POST /api/admin/users rejects invalid token', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'projectory_session=session-abc',
        'x-csrf-token': 'invalid'
      },
      body: JSON.stringify({ email: 'new-admin@example.com', displayName: 'New Admin', role: 'admin' })
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'CSRF token invalid.');
  });
});

test('csrf integration: POST /api/admin/users accepts valid token', async () => {
  await withServer(async (port) => {
    const token = await getCsrfToken(port);
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'projectory_session=session-abc',
        'x-csrf-token': token
      },
      body: JSON.stringify({ email: 'new-admin@example.com', displayName: 'New Admin', role: 'admin' })
    });

    assert.equal(response.status, 201);
  });
});

test('csrf integration: POST /api/projects rejects missing token', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'projectory_session=session-abc'
      },
      body: JSON.stringify({})
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'CSRF token missing.');
  });
});

test('csrf integration: POST /api/projects rejects invalid token', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'projectory_session=session-abc',
        'x-csrf-token': 'invalid'
      },
      body: JSON.stringify({})
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'CSRF token invalid.');
  });
});

test('csrf integration: POST /api/projects reaches route with valid token', async () => {
  await withServer(async (port) => {
    const token = await getCsrfToken(port);
    const response = await fetch(`http://127.0.0.1:${port}/api/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'projectory_session=session-abc',
        'x-csrf-token': token
      },
      body: JSON.stringify({})
    });

    assert.equal(response.status, 400);
  });
});

test('csrf integration: POST /api/assignments rejects missing token', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/assignments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'projectory_session=session-abc'
      },
      body: JSON.stringify({ projectId: 7 })
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'CSRF token missing.');
  });
});

test('csrf integration: POST /api/assignments rejects invalid token', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/assignments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'projectory_session=session-abc',
        'x-csrf-token': 'invalid'
      },
      body: JSON.stringify({ projectId: 7 })
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'CSRF token invalid.');
  });
});

test('csrf integration: POST /api/assignments reaches route with valid token', async () => {
  await withServer(async (port) => {
    const token = await getCsrfToken(port);
    const response = await fetch(`http://127.0.0.1:${port}/api/assignments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'projectory_session=session-abc',
        'x-csrf-token': token
      },
      body: JSON.stringify({ projectId: 7 })
    });

    assert.equal(response.status, 400);
  });
});
