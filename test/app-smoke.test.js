const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const { app, pool, startServer, clearRequestRateLimitBuckets, clearAuthAttemptBuckets } = require('../src/app');
const { buildPersonPayload, buildClientPayload, buildOnboardingProfilePayload } = require('../test-utils/builders');
const { hashPassword } = require('../src/auth/passwords');
const { hashOpaqueToken } = require('../src/auth/tokens');

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

const TEAMMATE_HEADERS = {
  'content-type': 'application/json',
  'x-projectory-user-role': 'teammate'
};

test('app module exports app and startServer', () => {
  assert.equal(typeof app, 'function');
  assert.equal(typeof startServer, 'function');
});

test('GET /invite serves SPA shell route', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/invite`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(/<html[\s>]/i.test(text), true);
  } finally {
    server.close();
  }
});

test('GET /api/meta includes baseline security headers', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('FROM priorities')) return { rows: [] };
    if (sql.includes('FROM trades')) return { rows: [] };
    if (sql.includes('FROM levels')) return { rows: [] };
    return { rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/meta`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const csp = String(response.headers.get('content-security-policy') || '');
    assert.equal(csp.includes("default-src 'self'"), true);
    assert.equal(csp.includes("script-src 'self'"), true);
    assert.equal(/script-src[^;]*'unsafe-inline'/.test(csp), false);
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});

test('POST /api/onboarding/profiles returns 413 for oversized JSON payload', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const huge = 'x'.repeat(180 * 1024);
    const response = await fetch(`http://127.0.0.1:${port}/api/onboarding/profiles`, {
      method: 'POST',
      headers: PLANNER_HEADERS,
      body: JSON.stringify({ firstName: huge })
    });

    assert.equal(response.status, 413);
    const body = await response.json();
    assert.equal(body.error, 'Payload too large.');
  } finally {
    server.close();
  }
});

test('POST /api/onboarding/profiles returns deterministic 400 for malformed JSON', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/onboarding/profiles`, {
      method: 'POST',
      headers: { ...PLANNER_HEADERS, 'content-type': 'application/json' },
      body: '{"firstName": "bad"'
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'Invalid JSON payload.');
  } finally {
    server.close();
  }
});

test('GET /health returns 429 after per-IP request limit is exceeded', async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [{ ok: 1 }] });

  const previousMax = process.env.REQUEST_RATE_LIMIT_MAX;
  const previousWindow = process.env.REQUEST_RATE_LIMIT_WINDOW_MS;
  process.env.REQUEST_RATE_LIMIT_MAX = '3';
  process.env.REQUEST_RATE_LIMIT_WINDOW_MS = '60000';

  const server = app.listen(0);
  const port = server.address().port;

  try {
    clearRequestRateLimitBuckets();
    for (let i = 0; i < 3; i += 1) {
      const okResponse = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(okResponse.status, 200);
    }

    const blocked = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.equal(body.error, 'Too many requests.');
  } finally {
    server.close();
    pool.query = originalQuery;
    if (previousMax === undefined) delete process.env.REQUEST_RATE_LIMIT_MAX; else process.env.REQUEST_RATE_LIMIT_MAX = previousMax;
    if (previousWindow === undefined) delete process.env.REQUEST_RATE_LIMIT_WINDOW_MS; else process.env.REQUEST_RATE_LIMIT_WINDOW_MS = previousWindow;
  }
});

test('GET /health rate limit window resets after configured interval', async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [{ ok: 1 }] });

  const previousMax = process.env.REQUEST_RATE_LIMIT_MAX;
  const previousWindow = process.env.REQUEST_RATE_LIMIT_WINDOW_MS;
  process.env.REQUEST_RATE_LIMIT_MAX = '1';
  process.env.REQUEST_RATE_LIMIT_WINDOW_MS = '20';

  const server = app.listen(0);
  const port = server.address().port;

  try {
    clearRequestRateLimitBuckets();

    const first = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(first.status, 200);

    const blocked = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(blocked.status, 429);

    await new Promise((resolve) => setTimeout(resolve, 30));

    const allowedAgain = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(allowedAgain.status, 200);
  } finally {
    server.close();
    pool.query = originalQuery;
    if (previousMax === undefined) delete process.env.REQUEST_RATE_LIMIT_MAX; else process.env.REQUEST_RATE_LIMIT_MAX = previousMax;
    if (previousWindow === undefined) delete process.env.REQUEST_RATE_LIMIT_WINDOW_MS; else process.env.REQUEST_RATE_LIMIT_WINDOW_MS = previousWindow;
  }
});

test('POST /api/auth/invite-preview returns invite user context for valid token', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (String(sql).includes('FROM user_invites ui')) {
      return {
        rowCount: 1,
        rows: [{ email: 'invited@example.com', display_name: 'Invited User', expires_at: new Date().toISOString() }]
      };
    }
    return { rowCount: 0, rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/invite-preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'invite-token' })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.user.email, 'invited@example.com');
    assert.equal(body.user.displayName, 'Invited User');
  } finally {
    server.close();
    pool.query = originalQuery;
  }
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




test('GET /api/admin/users returns users for admin without requiring people.email column', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('FROM users u')) {
      return {
        rowCount: 1,
        rows: [{
          id: 9,
          email: 'admin@example.com',
          display_name: 'Admin User',
          is_active: true,
          person_id: 12,
          password_hash: null,
          last_login_at: null,
          first_name: 'Ada',
          last_name: 'Lovelace',
          person_email: null,
          roles: ['admin'],
          latest_invited_at: null,
          latest_invite_expires_at: null,
          latest_invite_accepted_at: null
        }]
      };
    }
    return { rows: [], rowCount: 0 };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/users`, {
      headers: ADMIN_HEADERS
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, [{
      id: 9,
      email: 'admin@example.com',
      displayName: 'Admin User',
      isActive: true,
      personId: 12,
      personName: 'Ada Lovelace',
      personEmail: null,
      roles: ['admin'],
      status: 'provisioned',
      hasPassword: false,
      lastLoginAt: null,
      latestInvitedAt: null,
      latestInviteExpiresAt: null,
      latestInviteAcceptedAt: null,
      latestInviteId: null,
      canRevokeInvite: false
    }]);
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


test('PUT /api/admin/users/:id updates editable fields for admin', async () => {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;

  pool.query = async (sql) => {
    if (sql.includes('FROM roles')) return { rowCount: 1, rows: [{ id: 2, name: 'planner' }] };
    return { rowCount: 0, rows: [] };
  };

  const fakeClient = {
    async query(sql) {
      if (String(sql).includes('UPDATE users')) return { rowCount: 1, rows: [] };
      if (String(sql).includes('DELETE FROM user_roles')) return { rowCount: 1, rows: [] };
      if (String(sql).includes('INSERT INTO user_roles')) return { rowCount: 1, rows: [] };
      return { rowCount: 1, rows: [] };
    },
    release() {}
  };

  pool.connect = async () => fakeClient;

  const server = app.listen(0);
  const port = server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/users/12`, {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ email: 'updated@example.com', displayName: 'Updated Name', role: 'planner' })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
  } finally {
    server.close();
    pool.query = originalQuery;
    pool.connect = originalConnect;
  }
});

test('DELETE /api/admin/users/:id deletes user for admin', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('DELETE FROM users')) return { rowCount: 1, rows: [] };
    return { rowCount: 0, rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/users/8`, {
      method: 'DELETE',
      headers: ADMIN_HEADERS
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});

test('POST /api/admin/users/:id/invite requires smtp config before sending', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('FROM users')) {
      return { rowCount: 1, rows: [{ id: 5, email: 'invitee@example.com', is_active: true }] };
    }
    if (sql.includes('INSERT INTO user_invites')) {
      return { rowCount: 1, rows: [{ id: 1, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600_000).toISOString() }] };
    }
    if (sql.includes('FROM smtp_settings')) {
      return { rowCount: 1, rows: [{ enabled: false }] };
    }
    return { rowCount: 0, rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/users/5/invite`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ expiresHours: 24 })
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error, 'SMTP is not configured. Configure SMTP settings before sending invites.');
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});


test('POST /api/admin/users/:id/invite/revoke expires active invites', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('UPDATE user_invites')) {
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/users/5/invite/revoke`, {
      method: 'POST',
      headers: ADMIN_HEADERS
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, revoked: 1 });
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



test('PUT /api/admin/smtp-settings encrypts SMTP password before persistence', async () => {
  const originalQuery = pool.query;
  const previousKey = process.env.SMTP_PASSWORD_ENCRYPTION_KEY;
  process.env.SMTP_PASSWORD_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

  let storedPassword = null;
  pool.query = async (sql, params) => {
    if (String(sql).includes('UPDATE smtp_settings')) {
      storedPassword = params?.[3] || null;
      return { rowCount: 1, rows: [] };
    }
    if (String(sql).includes('SELECT host, port, username, password, from_email, secure, enabled')) {
      return {
        rowCount: 1,
        rows: [{
          host: 'smtp.example.com',
          port: 587,
          username: 'mailer',
          password: storedPassword,
          from_email: 'hello@example.com',
          secure: false,
          enabled: true
        }]
      };
    }
    return { rowCount: 0, rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/smtp-settings`, {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({
        host: 'smtp.example.com',
        port: 587,
        username: 'mailer',
        password: 'plain-secret',
        fromEmail: 'hello@example.com',
        secure: false,
        enabled: true
      })
    });

    assert.equal(response.status, 200);
    assert.equal(typeof storedPassword, 'string');
    assert.equal(storedPassword.includes('plain-secret'), false);
    assert.equal(storedPassword.startsWith('enc:v1:'), true);
  } finally {
    server.close();
    pool.query = originalQuery;
    if (previousKey === undefined) delete process.env.SMTP_PASSWORD_ENCRYPTION_KEY; else process.env.SMTP_PASSWORD_ENCRYPTION_KEY = previousKey;
  }
});

test('POST /api/admin/smtp-settings/test-email uses test recipient and supports AUTH=PLAIN capability format', async () => {
  let rcptToCommand = null;

  const smtpServer = net.createServer((socket) => {
    let dataMode = false;
    let dataBuffer = '';

    socket.write('220 localhost ESMTP\r\n');

    socket.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (dataMode) {
        dataBuffer += text;
        if (dataBuffer.includes('\r\n.\r\n')) {
          dataMode = false;
          dataBuffer = '';
          socket.write('250 Message accepted\r\n');
        }
        return;
      }

      const commands = text.split('\r\n').filter(Boolean);
      for (const command of commands) {
        if (command.startsWith('EHLO')) {
          socket.write('250-localhost\r\n250 AUTH=PLAIN\r\n');
        } else if (command.startsWith('AUTH PLAIN ')) {
          socket.write('235 2.7.0 Authentication successful\r\n');
        } else if (command.startsWith('MAIL FROM:')) {
          socket.write('250 2.1.0 OK\r\n');
        } else if (command.startsWith('RCPT TO:')) {
          rcptToCommand = command;
          socket.write('250 2.1.5 OK\r\n');
        } else if (command === 'DATA') {
          dataMode = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (command === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else {
          socket.write('502 5.5.2 Command not recognized\r\n');
        }
      }
    });
  });

  await new Promise((resolve) => smtpServer.listen(0, '127.0.0.1', resolve));
  const smtpPort = smtpServer.address().port;

  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('FROM smtp_settings')) {
      return {
        rowCount: 1,
        rows: [{
          host: '127.0.0.1',
          port: smtpPort,
          username: 'mailer',
          password: 'secret',
          from_email: 'noreply@example.com',
          secure: false,
          enabled: true
        }]
      };
    }
    return { rows: [], rowCount: 0 };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/smtp-settings/test-email`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ toEmail: 'qa@example.com' })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { ok: true, toEmail: 'qa@example.com', dryRun: false });
    assert.equal(rcptToCommand, 'RCPT TO:<qa@example.com>');
  } finally {
    server.close();
    pool.query = originalQuery;
    smtpServer.close();
  }
});

test('POST /api/admin/smtp-settings/test-email validates and supports dry-run send', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('FROM smtp_settings')) {
      return {
        rowCount: 1,
        rows: [{
          host: 'smtp.example.com',
          port: 465,
          username: 'mailer',
          password: 'secret',
          from_email: 'noreply@example.com',
          secure: true,
          enabled: true
        }]
      };
    }
    return { rows: [], rowCount: 0 };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/smtp-settings/test-email`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ toEmail: 'qa@example.com', dryRun: true })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { ok: true, toEmail: 'qa@example.com', dryRun: true });
  } finally {
    server.close();
    pool.query = originalQuery;
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



test('POST /api/auth/login applies deterministic lockout and resets counters after successful login', async () => {
  const originalQuery = pool.query;
  const previousMax = process.env.AUTH_PROTECTION_MAX_FAILURES;
  const previousWindow = process.env.AUTH_PROTECTION_WINDOW_MS;
  const previousLockout = process.env.AUTH_PROTECTION_LOCKOUT_MS;
  const previousBackoff = process.env.AUTH_PROTECTION_BACKOFF_BASE_MS;

  process.env.AUTH_PROTECTION_MAX_FAILURES = '2';
  process.env.AUTH_PROTECTION_WINDOW_MS = '60000';
  process.env.AUTH_PROTECTION_LOCKOUT_MS = '80';
  process.env.AUTH_PROTECTION_BACKOFF_BASE_MS = '1';

  const passwordHash = await hashPassword('correct-password');
  pool.query = async (sql, params) => {
    if (String(sql).includes('FROM users') && String(sql).includes('password_hash')) {
      return {
        rowCount: 1,
        rows: [{ id: 99, email: 'user@example.com', display_name: 'User', person_id: null, password_hash: passwordHash, is_active: true }]
      };
    }
    if (String(sql).includes('INSERT INTO auth_sessions')) {
      return { rowCount: 1, rows: [] };
    }
    if (String(sql).includes('UPDATE users')) {
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  };

  clearAuthAttemptBuckets();

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const fail1 = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'wrong' })
    });
    assert.equal(fail1.status, 401);

    const fail2 = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'wrong' })
    });
    assert.equal(fail2.status, 401);

    const locked = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'wrong' })
    });
    assert.equal(locked.status, 429);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const success = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'correct-password' })
    });
    assert.equal(success.status, 200);

    const failAfterReset = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'wrong' })
    });
    assert.equal(failAfterReset.status, 401);
  } finally {
    server.close();
    pool.query = originalQuery;
    clearAuthAttemptBuckets();
    if (previousMax === undefined) delete process.env.AUTH_PROTECTION_MAX_FAILURES; else process.env.AUTH_PROTECTION_MAX_FAILURES = previousMax;
    if (previousWindow === undefined) delete process.env.AUTH_PROTECTION_WINDOW_MS; else process.env.AUTH_PROTECTION_WINDOW_MS = previousWindow;
    if (previousLockout === undefined) delete process.env.AUTH_PROTECTION_LOCKOUT_MS; else process.env.AUTH_PROTECTION_LOCKOUT_MS = previousLockout;
    if (previousBackoff === undefined) delete process.env.AUTH_PROTECTION_BACKOFF_BASE_MS; else process.env.AUTH_PROTECTION_BACKOFF_BASE_MS = previousBackoff;
  }
});

test('POST /api/auth/accept-invite throttles repeated failures and resets after success', async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const previousMax = process.env.AUTH_PROTECTION_MAX_FAILURES;
  const previousWindow = process.env.AUTH_PROTECTION_WINDOW_MS;
  const previousLockout = process.env.AUTH_PROTECTION_LOCKOUT_MS;
  const previousBackoff = process.env.AUTH_PROTECTION_BACKOFF_BASE_MS;

  process.env.AUTH_PROTECTION_MAX_FAILURES = '2';
  process.env.AUTH_PROTECTION_WINDOW_MS = '60000';
  process.env.AUTH_PROTECTION_LOCKOUT_MS = '80';
  process.env.AUTH_PROTECTION_BACKOFF_BASE_MS = '1';

  const validTokenHash = hashOpaqueToken('valid-token');
  let validTokenFailureCount = 0;
  let allowValidToken = false;

  const fakeClient = {
    async query(sql, params) {
      if (String(sql).includes('FROM user_invites')) {
        if (params?.[0] === validTokenHash && allowValidToken) {
          return { rowCount: 1, rows: [{ id: 55, user_id: 10 }] };
        }
        if (params?.[0] === validTokenHash) {
          validTokenFailureCount += 1;
        }
        return { rowCount: 0, rows: [] };
      }
      if (String(sql).includes('SELECT email, display_name FROM users')) {
        return { rowCount: 1, rows: [{ email: 'invite@example.com', display_name: 'Invitee' }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {}
  };

  pool.connect = async () => fakeClient;
  pool.query = async () => ({ rowCount: 0, rows: [] });

  clearAuthAttemptBuckets();

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const invalid1 = await fetch(`http://127.0.0.1:${port}/api/auth/accept-invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'valid-token', password: 'long-enough-password' })
    });
    assert.equal(invalid1.status, 400);

    const invalid2 = await fetch(`http://127.0.0.1:${port}/api/auth/accept-invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'valid-token', password: 'long-enough-password' })
    });
    assert.equal(invalid2.status, 400);

    const throttled = await fetch(`http://127.0.0.1:${port}/api/auth/accept-invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'valid-token', password: 'long-enough-password' })
    });
    assert.equal(throttled.status, 429);

    await new Promise((resolve) => setTimeout(resolve, 100));

    allowValidToken = true;
    const success = await fetch(`http://127.0.0.1:${port}/api/auth/accept-invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'valid-token', password: 'long-enough-password' })
    });
    assert.equal(success.status, 200);

    allowValidToken = false;
    const invalidAfterSuccess = await fetch(`http://127.0.0.1:${port}/api/auth/accept-invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'valid-token', password: 'long-enough-password' })
    });
    assert.equal(invalidAfterSuccess.status, 400);
    assert.equal(validTokenFailureCount >= 3, true);
  } finally {
    server.close();
    pool.connect = originalConnect;
    pool.query = originalQuery;
    clearAuthAttemptBuckets();
    if (previousMax === undefined) delete process.env.AUTH_PROTECTION_MAX_FAILURES; else process.env.AUTH_PROTECTION_MAX_FAILURES = previousMax;
    if (previousWindow === undefined) delete process.env.AUTH_PROTECTION_WINDOW_MS; else process.env.AUTH_PROTECTION_WINDOW_MS = previousWindow;
    if (previousLockout === undefined) delete process.env.AUTH_PROTECTION_LOCKOUT_MS; else process.env.AUTH_PROTECTION_LOCKOUT_MS = previousLockout;
    if (previousBackoff === undefined) delete process.env.AUTH_PROTECTION_BACKOFF_BASE_MS; else process.env.AUTH_PROTECTION_BACKOFF_BASE_MS = previousBackoff;
  }
});

test('POST /api/auth/accept-invite sets password and marks invite as accepted', async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const calls = [];

  const fakeClient = {
    async query(sql, params) {
      calls.push(String(sql));
      if (String(sql).includes('FROM user_invites')) {
        return { rowCount: 1, rows: [{ id: 77, user_id: 9 }] };
      }
      if (String(sql).includes('SELECT email, display_name FROM users')) {
        return { rowCount: 1, rows: [{ email: 'invited@example.com', display_name: 'Invited User' }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {}
  };

  pool.connect = async () => fakeClient;
  pool.query = async () => ({ rowCount: 0, rows: [] });

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/accept-invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'invite-token', password: 'long-enough-password' })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(calls.some((sql) => sql.includes('UPDATE users')), true);
    assert.equal(calls.some((sql) => sql.includes('UPDATE user_invites')), true);
  } finally {
    server.close();
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});

test('GET /api/projects returns empty scoped payload for teammate without assigned projects', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('FROM projects p')) return { rows: [{ id: 1, name: 'P' }] };
    if (sql.includes('FROM challenges ch')) return { rows: [{ id: 2, project_id: 1 }] };
    if (sql.includes('FROM assignments a')) return { rows: [{ id: 3, project_id: 1 }] };
    return { rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/projects`, {
      headers: TEAMMATE_HEADERS
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { projects: [], challenges: [], assignments: [] });
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});

test('GET /api/projects includes teammate assignment-scoped projects by person link', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('SELECT DISTINCT project_id') && sql.includes('FROM assignments') && sql.includes('WHERE person_id = $1')) {
      return { rows: [{ project_id: 1 }] };
    }
    if (sql.includes('FROM projects p')) return { rows: [{ id: 1, name: 'P' }, { id: 2, name: 'Hidden' }] };
    if (sql.includes('FROM challenges ch')) return { rows: [{ id: 10, project_id: 1 }, { id: 20, project_id: 2 }] };
    if (sql.includes('FROM assignments a')) return { rows: [{ id: 30, project_id: 1 }, { id: 40, project_id: 2 }] };
    return { rows: [] };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/projects`, {
      headers: {
        ...TEAMMATE_HEADERS,
        'x-projectory-person-id': '55'
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, {
      projects: [{ id: 1, name: 'P' }],
      challenges: [{ id: 10, project_id: 1 }],
      assignments: [{ id: 30, project_id: 1 }]
    });
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});

test('POST /api/projects forbids teammate role', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/projects`, {
      method: 'POST',
      headers: TEAMMATE_HEADERS,
      body: JSON.stringify({ clientId: 1, name: 'New', startMonth: '2026-01', budgetEuros: 1000 })
    });

    assert.equal(response.status, 403);
  } finally {
    server.close();
  }
});

test('PUT /api/projects/:projectId/people/:personId/quantity forbids teammate editing other person workload', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/projects/1/people/99/quantity`, {
      method: 'PUT',
      headers: {
        ...TEAMMATE_HEADERS,
        'x-projectory-user-id': '5',
        'x-projectory-user-name': 'Scoped Teammate'
      },
      body: JSON.stringify({ quantity: 50 })
    });

    assert.equal(response.status, 403);
  } finally {
    server.close();
  }
});


test('GET /api/people returns full non-hidden list for teammate assignment modal', async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({
    rows: [
      { id: 1, first_name: 'Visible', last_name: 'Person', is_hidden: false },
      { id: 2, first_name: 'Hidden', last_name: 'Person', is_hidden: true }
    ],
    rowCount: 2
  });

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/people`, {
      headers: TEAMMATE_HEADERS
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, [{ id: 1, first_name: 'Visible', last_name: 'Person', is_hidden: false }]);
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});

test('PUT /api/challenges/:id forbids teammate for challenge outside scope', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('FROM challenges')) {
      return { rows: [{ project_id: 42 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/challenges/7`, {
      method: 'PUT',
      headers: TEAMMATE_HEADERS,
      body: JSON.stringify({ title: 'T', description: 'D' })
    });

    assert.equal(response.status, 403);
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});


test('GET /api/admin/audit returns audit entries for admin', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('FROM audit_log')) {
      return {
        rows: [{ id: 1, action: 'POST /api/projects', actor_role: 'admin', created_at: new Date().toISOString() }],
        rowCount: 1
      };
    }
    return { rows: [], rowCount: 0 };
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/audit?limit=10`, {
      headers: ADMIN_HEADERS
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(Array.isArray(body.entries), true);
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].action, 'POST /api/projects');
  } finally {
    server.close();
    pool.query = originalQuery;
  }
});
