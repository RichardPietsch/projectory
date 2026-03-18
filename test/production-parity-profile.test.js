const test = require('node:test');
const assert = require('node:assert/strict');

const { app, getAuthMode, validateAuthRuntimeSafety, validateRuntimeEnvironment } = require('../src/app');

function withEnv(overrides, fn) {
  const original = {};
  for (const [key, value] of Object.entries(overrides)) {
    original[key] = process.env[key];
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('production parity profile resolves session auth mode and passes runtime safety validation', () => {
  withEnv(
    {
      AUTH_LOCAL_DEV: 'false',
      AUTH_MODE: 'session',
      AUTH_ALLOW_HEADER_SIMULATION: 'false',
      TRUST_PROXY: 'loopback',
      AUTH_COOKIE_SECURE: 'true',
      DB_HOST: '127.0.0.1',
      DB_PORT: '5432',
      DB_NAME: 'helloapp',
      DB_USER: 'hello',
      DB_PASSWORD: 'hello',
      SMTP_PASSWORD_ENCRYPTION_KEY: 'dev-placeholder-secret-value-not-hex',
      AUTH_CSRF_SECRET: 'dev-placeholder-secret-value-not-hex'
    },
    () => {
      assert.equal(getAuthMode(), 'session');
      assert.doesNotThrow(() => validateAuthRuntimeSafety());
      assert.doesNotThrow(() => validateRuntimeEnvironment());
    }
  );
});

test('production parity profile ignores auth simulation headers on /api/auth/me', async () => {
  await withEnv(
    {
      AUTH_LOCAL_DEV: 'false',
      AUTH_MODE: 'session',
      AUTH_ALLOW_HEADER_SIMULATION: 'false',
      TRUST_PROXY: 'loopback',
      AUTH_COOKIE_SECURE: 'true',
      DB_HOST: '127.0.0.1',
      DB_PORT: '5432',
      DB_NAME: 'helloapp',
      DB_USER: 'hello',
      DB_PASSWORD: 'hello',
      SMTP_PASSWORD_ENCRYPTION_KEY: 'dev-placeholder-secret-value-not-hex',
      AUTH_CSRF_SECRET: 'dev-placeholder-secret-value-not-hex'
    },
    async () => {
      const server = app.listen(0);
      try {
        const address = server.address();
        const baseUrl = `http://127.0.0.1:${address.port}`;
        const response = await fetch(`${baseUrl}/api/auth/me`, {
          headers: {
            'x-user-id': 'u-123',
            'x-user-role': 'admin'
          }
        });
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.authMode, 'session');
        assert.equal(payload.authSource, 'anonymous');
        assert.equal(payload.userId, null);
        assert.equal(payload.role, 'viewer');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }
  );
});
