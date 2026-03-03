const test = require('node:test');
const assert = require('node:assert/strict');

const { app, pool, startServer } = require('../src/app');
const { buildPersonPayload, buildClientPayload, buildOnboardingProfilePayload } = require('../test-utils/builders');

const PLANNER_HEADERS = {
  'content-type': 'application/json',
  'x-projectory-user-role': 'planner'
};

const VIEWER_HEADERS = {
  'content-type': 'application/json',
  'x-projectory-user-role': 'viewer'
};

const ADMIN_HEADERS = {
  'content-type': 'application/json',
  'x-projectory-user-role': 'admin'
};

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



test('POST /api/onboarding/profiles forbids viewer role', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/onboarding/profiles`, {
      method: 'POST',
      headers: VIEWER_HEADERS,
      body: JSON.stringify(buildOnboardingProfilePayload({ email: undefined, status: undefined }))
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'Forbidden.');
  } finally {
    server.close();
  }
});

test('POST /api/onboarding/profiles creates profile for planner', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('INSERT INTO onboarding_profiles')) {
      return { rows: [{ id: 99 }] };
    }
    return { rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/onboarding/profiles`, {
      method: 'POST',
      headers: PLANNER_HEADERS,
      body: JSON.stringify(buildOnboardingProfilePayload())
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.deepEqual(body, { id: 99 });
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});

test('POST /api/clients validates required payload', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/clients`, {
      method: 'POST',
      headers: PLANNER_HEADERS,
      body: JSON.stringify({ name: 'Acme' })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'sinceMonth must be in yyyy-mm format.');
  } finally {
    server.close();
  }
});

test('POST /api/clients creates client and returns id', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('INSERT INTO clients')) {
      return { rows: [{ id: 7 }] };
    }
    return { rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/clients`, {
      method: 'POST',
      headers: PLANNER_HEADERS,
      body: JSON.stringify(buildClientPayload())
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.deepEqual(body, { id: 7 });
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});

test('POST /api/people forbids viewer role', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/people`, {
      method: 'POST',
      headers: VIEWER_HEADERS,
      body: JSON.stringify(buildPersonPayload())
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'Forbidden.');
  } finally {
    server.close();
  }
});

test('POST /api/people validates required fields for planner role', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/people`, {
      method: 'POST',
      headers: PLANNER_HEADERS,
      body: JSON.stringify({ firstName: 'A' })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'firstName, lastName, tradeId and levelId are required.');
  } finally {
    server.close();
  }
});


test('POST /api/people rejects invalid status values', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/people`, {
      method: 'POST',
      headers: PLANNER_HEADERS,
      body: JSON.stringify(buildPersonPayload({ status: 'unknown' }))
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'status must be one of: active, paused, leaver.');
  } finally {
    server.close();
  }
});

test('POST /api/people allows planner role and returns id', async () => {
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
      headers: PLANNER_HEADERS,
      body: JSON.stringify(buildPersonPayload())
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.deepEqual(body, { id: 42 });
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});


test('POST /api/projects forbids viewer role', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/projects`, {
      method: 'POST',
      headers: VIEWER_HEADERS,
      body: JSON.stringify({ clientId: 1, name: 'Website', startMonth: '2024-01', budgetEuros: 1000 })
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'Forbidden.');
  } finally {
    server.close();
  }
});

test('POST /api/import forbids planner role', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/import`, {
      method: 'POST',
      headers: PLANNER_HEADERS,
      body: JSON.stringify({ clients: [], projects: [], people: [], challenges: [], assignments: [] })
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'Forbidden.');
  } finally {
    server.close();
  }
});

test('GET /api/export allows viewer role', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('FROM clients')) return { rows: [] };
    if (sql.includes('FROM projects')) return { rows: [] };
    if (sql.includes('FROM people')) return { rows: [] };
    if (sql.includes('FROM challenges')) return { rows: [] };
    if (sql.includes('FROM assignments')) return { rows: [] };
    return { rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/export`, {
      headers: {
        'x-projectory-user-role': 'viewer'
      }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, {
      exportedAt: body.exportedAt,
      version: 1,
      data: {
        clients: [],
        projects: [],
        people: [],
        challenges: [],
        assignments: []
      }
    });
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});


test('POST /api/admin/users forbids viewer role', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/users`, {
      method: 'POST',
      headers: VIEWER_HEADERS,
      body: JSON.stringify({ email: 'new.user@example.com', displayName: 'New User', role: 'viewer' })
    });

    assert.equal(response.status, 403);
  } finally {
    server.close();
  }
});

test('POST /api/admin/users creates user and assigns role for admin', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('FROM roles')) {
      return { rowCount: 1, rows: [{ id: 3, name: 'viewer' }] };
    }
    if (sql.includes('INSERT INTO users')) {
      return { rows: [{ id: 501 }] };
    }
    if (sql.includes('INSERT INTO user_roles')) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/users`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ email: 'new.user@example.com', displayName: 'New User', role: 'viewer' })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.deepEqual(body, { id: 501 });
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});

test('PUT /api/admin/smtp-settings validates required fields when enabled', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/smtp-settings`, {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ enabled: true, host: '', fromEmail: '' })
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'host, port and fromEmail are required when SMTP is enabled.');
  } finally {
    server.close();
  }
});


test('GET /api/admin/users/:id/project-access returns project scope list for admin', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('FROM user_project_access')) {
      return { rows: [{ project_id: 11 }, { project_id: 19 }], rowCount: 2 };
    }
    return { rows: [], rowCount: 0 };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/users/5/project-access`, {
      headers: ADMIN_HEADERS
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { userId: 5, projectIds: [11, 19] });
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});

test('PUT /api/admin/users/:id/project-access validates payload shape', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/users/5/project-access`, {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ projectIds: 'invalid' })
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'projectIds must be an array.');
  } finally {
    server.close();
  }
});
