const test = require('node:test');
const assert = require('node:assert/strict');

const {
  serializeSessionCookie,
  clearSessionCookie,
  parseTrustProxySetting,
  shouldUseSecureSessionCookie,
  validateRuntimeEnvironment
} = require('../src/app');

function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('parseTrustProxySetting parses boolean/number/list presets', () => {
  assert.equal(parseTrustProxySetting('true'), true);
  assert.equal(parseTrustProxySetting('*'), true);
  assert.equal(parseTrustProxySetting('false'), false);
  assert.equal(parseTrustProxySetting('1'), 1);
  assert.equal(parseTrustProxySetting('loopback'), 'loopback');
  assert.deepEqual(parseTrustProxySetting('loopback, linklocal'), ['loopback', 'linklocal']);
  assert.equal(parseTrustProxySetting(''), false);
});

test('session cookies are not Secure in local-dev mode', () => {
  withEnv({ AUTH_LOCAL_DEV: 'true', NODE_ENV: 'development' }, () => {
    const cookie = serializeSessionCookie('session-id', new Date(Date.now() + 60_000));
    const cleared = clearSessionCookie();
    assert.equal(shouldUseSecureSessionCookie(), false);
    assert.equal(cookie.includes('; Secure'), false);
    assert.equal(cleared.includes('; Secure'), false);
  });
});

test('session cookies are always Secure in non-local runtime', () => {
  withEnv({ AUTH_LOCAL_DEV: 'false', NODE_ENV: 'production' }, () => {
    const cookie = serializeSessionCookie('session-id', new Date(Date.now() + 60_000));
    const cleared = clearSessionCookie();
    assert.equal(shouldUseSecureSessionCookie(), true);
    assert.equal(cookie.includes('; Secure'), true);
    assert.equal(cleared.includes('; Secure'), true);
  });
});

test('runtime env validation fails fast for non-local missing TRUST_PROXY', () => {
  withEnv({
    NODE_ENV: 'production',
    AUTH_LOCAL_DEV: 'false',
    AUTH_MODE: 'session',
    DB_HOST: 'db.example',
    DB_PORT: '5432',
    DB_NAME: 'projectory',
    DB_USER: 'appuser',
    DB_PASSWORD: 'super-secure-password',
    SMTP_PASSWORD_ENCRYPTION_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    AUTH_CSRF_SECRET: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    TRUST_PROXY: 'false'
  }, () => {
    assert.throws(() => validateRuntimeEnvironment(), /TRUST_PROXY must be configured/);
  });
});

test('runtime env validation fails fast for non-local AUTH_COOKIE_SECURE=false', () => {
  withEnv({
    NODE_ENV: 'production',
    AUTH_LOCAL_DEV: 'false',
    AUTH_MODE: 'session',
    DB_HOST: 'db.example',
    DB_PORT: '5432',
    DB_NAME: 'projectory',
    DB_USER: 'appuser',
    DB_PASSWORD: 'super-secure-password',
    SMTP_PASSWORD_ENCRYPTION_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    AUTH_CSRF_SECRET: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    TRUST_PROXY: '1',
    AUTH_COOKIE_SECURE: 'false'
  }, () => {
    assert.throws(() => validateRuntimeEnvironment(), /AUTH_COOKIE_SECURE=false is not allowed/);
  });
});
