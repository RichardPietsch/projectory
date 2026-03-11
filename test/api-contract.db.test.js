const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { app, pool, clearRequestRateLimitBuckets, clearAuthAttemptBuckets } = require('../src/app');
const { hashPassword } = require('../src/auth/passwords');
const { hashOpaqueToken } = require('../src/auth/tokens');

const shouldRun = process.env.RUN_DB_INTEGRATION === '1';
const contractTest = shouldRun ? test : test.skip;

let server;
let baseUrl;

function buildSuffix() {
  return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function jsonHeaders(extra = {}) {
  return {
    'content-type': 'application/json',
    ...extra
  };
}

async function resetDeterministicFixtures() {
  await pool.query(`
    TRUNCATE TABLE
      audit_log,
      user_project_access,
      user_invites,
      password_reset_tokens,
      auth_sessions,
      user_roles,
      users,
      assignments,
      challenges,
      onboarding_steps,
      onboarding_profiles,
      projects,
      people,
      clients
    RESTART IDENTITY CASCADE
  `);

  await pool.query(
    `INSERT INTO smtp_settings (id, host, port, username, password, from_email, secure, enabled)
     VALUES (1, NULL, NULL, NULL, NULL, NULL, TRUE, FALSE)
     ON CONFLICT (id)
     DO UPDATE SET
       host = EXCLUDED.host,
       port = EXCLUDED.port,
       username = EXCLUDED.username,
       password = EXCLUDED.password,
       from_email = EXCLUDED.from_email,
       secure = EXCLUDED.secure,
       enabled = EXCLUDED.enabled,
       updated_at = NOW()`
  );
}

async function createUserWithRole({ suffix, role = 'admin', password = 'Passw0rd!Passw0rd!' }) {
  const passwordHash = await hashPassword(password);
  const created = await pool.query(
    `INSERT INTO users (email, display_name, is_active, password_hash)
     VALUES ($1, $2, TRUE, $3)
     RETURNING id, email`,
    [`${role}.${suffix}@example.com`, `${role} ${suffix}`, passwordHash]
  );
  const userId = Number(created.rows[0].id);

  const roleResult = await pool.query('SELECT id FROM roles WHERE name = $1 LIMIT 1', [role]);
  assert.equal(roleResult.rowCount, 1, `expected role '${role}' to exist`);

  await pool.query(
    `INSERT INTO user_roles (user_id, role_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, roleResult.rows[0].id]
  );

  return {
    userId,
    email: created.rows[0].email,
    password
  };
}

test.before(async () => {
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(async () => {
  await resetDeterministicFixtures();
  clearRequestRateLimitBuckets();
  clearAuthAttemptBuckets();
});

contractTest('real-db auth contract: login creates a persisted session and /api/auth/me resolves session context', async () => {
  const suffix = buildSuffix();
  const created = await createUserWithRole({ suffix, role: 'admin' });

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email: created.email, password: created.password })
  });

  assert.equal(loginResponse.status, 200);
  const cookieHeader = loginResponse.headers.get('set-cookie') || '';
  const sessionCookie = cookieHeader.split(';')[0];
  assert.equal(sessionCookie.startsWith('projectory_session='), true);

  const sessionCount = await pool.query('SELECT COUNT(*)::int AS count FROM auth_sessions WHERE user_id = $1', [created.userId]);
  assert.equal(sessionCount.rows[0].count, 1, 'login should persist exactly one auth session row');

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      cookie: sessionCookie,
      'x-projectory-user-role': 'viewer'
    }
  });

  assert.equal(meResponse.status, 200);
  const mePayload = await meResponse.json();
  assert.equal(mePayload.userId, String(created.userId));
  assert.equal(mePayload.email, created.email);
  assert.equal(mePayload.authSource, 'session');
  assert.equal(mePayload.role, 'admin');
  assert.equal(mePayload.permissions.includes('admin:access'), true);

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { cookie: sessionCookie }
  });

  assert.equal(logoutResponse.status, 200);

  const revokedRows = await pool.query(
    'SELECT COUNT(*)::int AS count FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NOT NULL',
    [created.userId]
  );
  assert.equal(revokedRows.rows[0].count, 1, 'logout should revoke persisted auth session row');
});

contractTest('real-db admin contract: user provisioning + invite lifecycle writes expected rows', async () => {
  const suffix = buildSuffix();
  const newEmail = `provisioned.${suffix}@example.com`;

  const createResponse = await fetch(`${baseUrl}/api/admin/users`, {
    method: 'POST',
    headers: jsonHeaders({ 'x-projectory-user-role': 'admin' }),
    body: JSON.stringify({
      email: newEmail,
      displayName: `Provisioned ${suffix}`,
      role: 'viewer',
      isActive: true
    })
  });

  assert.equal(createResponse.status, 201);
  const createdBody = await createResponse.json();
  const userId = Number(createdBody.id);
  assert.equal(Number.isInteger(userId), true);

  const dbUser = await pool.query('SELECT email, is_active FROM users WHERE id = $1', [userId]);
  assert.equal(dbUser.rowCount, 1);
  assert.equal(dbUser.rows[0].email, newEmail);
  assert.equal(dbUser.rows[0].is_active, true);

  const roleRows = await pool.query(
    `SELECT r.name
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );
  assert.deepEqual(roleRows.rows.map((row) => row.name), ['viewer']);

  const inviteResponse = await fetch(`${baseUrl}/api/admin/users/${userId}/invite`, {
    method: 'POST',
    headers: jsonHeaders({ 'x-projectory-user-role': 'admin', 'x-projectory-user-id': '99' }),
    body: JSON.stringify({ expiresHours: 48 })
  });

  assert.equal(inviteResponse.status, 409, 'without SMTP configured endpoint still creates invite row before delivery step');

  const inviteRows = await pool.query(
    `SELECT id, expires_at > NOW() AS is_future
     FROM user_invites
     WHERE user_id = $1 AND accepted_at IS NULL
     ORDER BY created_at DESC`,
    [userId]
  );
  assert.equal(inviteRows.rowCount, 1);
  assert.equal(inviteRows.rows[0].is_future, true);

  const revokeResponse = await fetch(`${baseUrl}/api/admin/users/${userId}/invite/revoke`, {
    method: 'POST',
    headers: jsonHeaders({ 'x-projectory-user-role': 'admin' }),
    body: JSON.stringify({})
  });

  assert.equal(revokeResponse.status, 200);
  const revokedInvite = await pool.query(
    `SELECT expires_at <= NOW() AS is_revoked
     FROM user_invites
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  assert.equal(revokedInvite.rows[0].is_revoked, true);

  const listedUsersResponse = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { 'x-projectory-user-role': 'admin' }
  });
  assert.equal(listedUsersResponse.status, 200);
  const listedUsers = await listedUsersResponse.json();
  const listedUser = listedUsers.find((candidate) => Number(candidate.id) === userId);
  assert.equal(Boolean(listedUser), true);
  assert.equal(listedUser.status, 'invite_expired');
});

contractTest('real-db import/export contract: import replaces state and export reflects schema payload', async () => {
  const priorityId = Number((await pool.query('SELECT id FROM priorities ORDER BY id LIMIT 1')).rows[0].id);
  const tradeId = Number((await pool.query('SELECT id FROM trades ORDER BY id LIMIT 1')).rows[0].id);
  const levelId = Number((await pool.query('SELECT id FROM levels ORDER BY id LIMIT 1')).rows[0].id);

  const importPayload = {
    clients: [{ id: 1001, name: 'Contract Client', location: 'Berlin', since_month: '2024-01', priority_id: priorityId }],
    projects: [{ id: 2001, client_id: 1001, name: 'Contract Project', status: 'green', start_month: '2024-01', end_month: '2024-12', budget_cents: 120000 }],
    people: [{ id: 3001, first_name: 'Casey', last_name: 'Contract', trade_id: tradeId, level_id: levelId, is_hidden: false, is_leaver: false, status: 'active', working_hours: 40 }],
    challenges: [{ id: 4001, project_id: 2001, title: 'Contract Challenge', description: 'Validate import/export contract' }],
    assignments: [{ id: 5001, project_id: 2001, challenge_id: 4001, person_id: 3001, is_owner: true, is_leader: false, quantity: '100.00' }]
  };

  const importResponse = await fetch(`${baseUrl}/api/import`, {
    method: 'POST',
    headers: jsonHeaders({ 'x-projectory-user-role': 'admin' }),
    body: JSON.stringify({ data: importPayload })
  });

  assert.equal(importResponse.status, 200);
  const importBody = await importResponse.json();
  assert.equal(importBody.ok, true);

  const countChecks = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM clients'),
    pool.query('SELECT COUNT(*)::int AS count FROM projects'),
    pool.query('SELECT COUNT(*)::int AS count FROM people'),
    pool.query('SELECT COUNT(*)::int AS count FROM challenges'),
    pool.query('SELECT COUNT(*)::int AS count FROM assignments')
  ]);

  assert.deepEqual(countChecks.map((result) => result.rows[0].count), [1, 1, 1, 1, 1]);

  const exportResponse = await fetch(`${baseUrl}/api/export`, {
    headers: { 'x-projectory-user-role': 'admin' }
  });

  assert.equal(exportResponse.status, 200);
  const exportPayload = await exportResponse.json();
  assert.equal(exportPayload.version, 1);
  assert.equal(exportPayload.data.clients[0].name, 'Contract Client');
  assert.equal(exportPayload.data.projects[0].client_id, 1001);
  assert.equal(exportPayload.data.people[0].trade, (await pool.query('SELECT name FROM trades WHERE id = $1', [tradeId])).rows[0].name);
  assert.equal(exportPayload.data.assignments[0].id, 5001);

  const csvExportResponse = await fetch(`${baseUrl}/api/export?format=csv`, {
    headers: { 'x-projectory-user-role': 'admin' }
  });
  assert.equal(csvExportResponse.status, 200);
  const csv = await csvExportResponse.text();
  assert.equal(csv.includes('entity,id'), true);
  assert.equal(csv.includes('clients,1001,Contract Client'), true);
});

contractTest('real-db auth contract: invite preview + accept-invite persists password and invalidates token', async () => {
  const suffix = buildSuffix();
  const created = await pool.query(
    `INSERT INTO users (email, display_name, is_active)
     VALUES ($1, $2, TRUE)
     RETURNING id`,
    [`invite.${suffix}@example.com`, `Invite ${suffix}`]
  );
  const userId = Number(created.rows[0].id);

  const rawToken = `token_${suffix}`;
  await pool.query(
    `INSERT INTO user_invites (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '2 hours')`,
    [userId, hashOpaqueToken(rawToken)]
  );

  const previewResponse = await fetch(`${baseUrl}/api/auth/invite-preview`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ token: rawToken })
  });
  assert.equal(previewResponse.status, 200);
  const previewBody = await previewResponse.json();
  assert.equal(previewBody.user.email, `invite.${suffix}@example.com`);

  const acceptResponse = await fetch(`${baseUrl}/api/auth/accept-invite`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ token: rawToken, password: 'MyStrongP4ssword!' })
  });

  assert.equal(acceptResponse.status, 200);
  const acceptBody = await acceptResponse.json();
  assert.equal(acceptBody.ok, true);

  const acceptedInvite = await pool.query(
    'SELECT accepted_at IS NOT NULL AS accepted FROM user_invites WHERE user_id = $1',
    [userId]
  );
  assert.equal(acceptedInvite.rows[0].accepted, true);

  const persistedPassword = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  assert.equal(Boolean(persistedPassword.rows[0].password_hash), true);

  const repeatPreviewResponse = await fetch(`${baseUrl}/api/auth/invite-preview`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ token: rawToken })
  });
  assert.equal(repeatPreviewResponse.status, 404);
});
