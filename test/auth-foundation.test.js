const test = require('node:test');
const assert = require('node:assert/strict');

const { app, startServer, validateAuthRuntimeSafety, validateRuntimeEnvironment } = require('../src/app');
const { getPermissionsForRole, PERMISSIONS, hasPermission } = require('../src/auth/permissions');

function withEnv(overrides, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of previous.entries()) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    });
}

test('permissions map resolves expected role capabilities', () => {
  const viewer = getPermissionsForRole('viewer');
  assert.equal(hasPermission(viewer, PERMISSIONS.PEOPLE_READ), true);
  assert.equal(hasPermission(viewer, PERMISSIONS.PEOPLE_WRITE), false);

  const admin = getPermissionsForRole('admin');
  assert.equal(hasPermission(admin, PERMISSIONS.ADMIN_ACCESS), true);

  const teammate = getPermissionsForRole('teammate');
  assert.equal(hasPermission(teammate, PERMISSIONS.PROJECTS_WRITE), true);
  assert.equal(hasPermission(teammate, PERMISSIONS.ADMIN_ACCESS), false);
});

test('GET /api/auth/me exposes safe auth context defaults without local header simulation opt-in', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.role, 'viewer');
    assert.equal(Array.isArray(body.permissions), true);
    assert.equal(body.permissions.includes('people:write'), false);
  } finally {
    server.close();
  }
});

test('GET /api/auth/me supports role override headers only when local simulation opt-in is enabled', async () => {
  await withEnv({ NODE_ENV: 'development', AUTH_LOCAL_DEV: 'true', AUTH_ALLOW_HEADER_SIMULATION: 'true', AUTH_DEFAULT_ROLE: 'admin' }, async () => {
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
        headers: {
          'x-projectory-user-role': 'viewer',
          'x-projectory-user-id': 'u-123',
          'x-projectory-user-email': 'viewer@example.com',
          'x-projectory-user-name': 'Viewer User'
        }
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.role, 'viewer');
      assert.equal(body.userId, 'u-123');
      assert.equal(body.email, 'viewer@example.com');
      assert.equal(body.displayName, 'Viewer User');
      assert.equal(body.permissions.includes('people:write'), false);
    } finally {
      server.close();
    }
  });
});


test('GET /api/auth/me marks header teammate context as scoped teammate when simulation is enabled', async () => {
  await withEnv({ NODE_ENV: 'development', AUTH_LOCAL_DEV: 'true', AUTH_ALLOW_HEADER_SIMULATION: 'true' }, async () => {
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
        headers: {
          'x-projectory-user-role': 'teammate',
          'x-projectory-user-id': 'u-777'
        }
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.role, 'teammate');
      assert.equal(body.isScopedTeammate, true);
      assert.deepEqual(body.scopedProjectIds, []);
    } finally {
      server.close();
    }
  });
});

test('GET /api/auth/me exposes normalized authMode value and defaults to session', async () => {
  await withEnv({ AUTH_MODE: '   SESSION   ' }, async () => {
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.authMode, 'session');
    } finally {
      server.close();
    }
  });
});

test('GET /api/auth/me ignores header simulation when AUTH_MODE=session without valid session cookie', async () => {
  await withEnv({ AUTH_MODE: 'session', NODE_ENV: 'development', AUTH_LOCAL_DEV: 'true', AUTH_ALLOW_HEADER_SIMULATION: 'true' }, async () => {
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
        headers: {
          'x-projectory-user-role': 'admin',
          'x-projectory-user-id': 'u-999',
          'x-projectory-user-email': 'admin@example.com',
          'x-projectory-user-name': 'Admin Header User'
        }
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.authMode, 'session');
      assert.equal(body.authSource, 'anonymous');
      assert.equal(body.role, 'viewer');
      assert.equal(body.userId, null);
      assert.equal(body.email, null);
      assert.equal(body.displayName, null);
      assert.equal(body.isScopedTeammate, false);
      assert.equal(body.permissions.includes('admin:access'), false);
    } finally {
      server.close();
    }
  });
});


test('non-local request handling ignores header simulation on /api/auth/me even if opt-in env flag is set', async () => {
  await withEnv({ NODE_ENV: 'staging', AUTH_LOCAL_DEV: 'false', AUTH_MODE: 'session', AUTH_ALLOW_HEADER_SIMULATION: 'true' }, async () => {
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
        headers: {
          'x-projectory-user-role': 'admin',
          'x-projectory-user-id': 'u-999',
          'x-projectory-user-email': 'admin@example.com',
          'x-projectory-user-name': 'Injected Admin'
        }
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.authSource, 'anonymous');
      assert.equal(body.role, 'viewer');
      assert.equal(body.userId, null);
      assert.equal(body.email, null);
      assert.equal(body.displayName, null);
      assert.equal(body.permissions.includes('admin:access'), false);
    } finally {
      server.close();
    }
  });
});

test('startServer fails fast in production when AUTH_MODE is not session', async () => {
  await withEnv({ NODE_ENV: 'production', AUTH_LOCAL_DEV: 'false', AUTH_MODE: 'header' }, async () => {
    assert.throws(() => validateAuthRuntimeSafety(), /Non-local environments require AUTH_MODE=session/);
    await assert.rejects(startServer(), /Non-local environments require AUTH_MODE=session/);
  });
});

test('startServer fails fast in staging when header simulation is enabled', async () => {
  await withEnv({ NODE_ENV: 'staging', AUTH_LOCAL_DEV: 'false', AUTH_MODE: 'session', AUTH_ALLOW_HEADER_SIMULATION: 'true' }, async () => {
    assert.throws(() => validateAuthRuntimeSafety(), /AUTH_ALLOW_HEADER_SIMULATION=true is only allowed for local development/);
    await assert.rejects(startServer(), /AUTH_ALLOW_HEADER_SIMULATION=true is only allowed for local development/);
  });
});


test('runtime env validation allows local-dev defaults', async () => {
  await withEnv({ NODE_ENV: 'development', AUTH_LOCAL_DEV: 'true', DB_USER: undefined, DB_PASSWORD: undefined, SMTP_PASSWORD_ENCRYPTION_KEY: undefined }, async () => {
    assert.doesNotThrow(() => validateRuntimeEnvironment());
  });
});

test('runtime env validation fails in non-local when required secrets are missing', async () => {
  await withEnv({ NODE_ENV: 'production', AUTH_LOCAL_DEV: 'false', DB_HOST: 'db.example', DB_PORT: '5432', DB_NAME: 'projectory', DB_USER: 'appuser', DB_PASSWORD: '', SMTP_PASSWORD_ENCRYPTION_KEY: '' }, async () => {
    assert.throws(() => validateRuntimeEnvironment(), /Missing required environment variables for non-local runtime/);
  });
});

test('runtime env validation blocks placeholder DB credentials in non-local runtime', async () => {
  await withEnv({ NODE_ENV: 'staging', AUTH_LOCAL_DEV: 'false', DB_HOST: 'db.example', DB_PORT: '5432', DB_NAME: 'projectory', DB_USER: 'projectory_local_user', DB_PASSWORD: 'projectory_local_password', SMTP_PASSWORD_ENCRYPTION_KEY: 'this-is-a-long-secret-at-least-32-chars' }, async () => {
    assert.throws(() => validateRuntimeEnvironment(), /Unsafe database credentials detected for non-local runtime/);
  });
});

