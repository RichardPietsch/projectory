const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAuthHandlers } = require('../src/app/auth-handlers');

function createBaseDeps(overrides = {}) {
  return {
    getAuthMode: () => 'hybrid',
    isInitialAdminRegistrationOpen: async () => false,
    handleDbError: (_res, error) => {
      throw error;
    },
    badRequest: (res, message) => res.status(400).json({ error: message }),
    validatePasswordStrength: () => null,
    pool: {
      query: async () => ({ rowCount: 0, rows: [] }),
      connect: async () => ({ query: async () => ({ rowCount: 0, rows: [] }), release() {} })
    },
    hashPassword: async () => 'hash',
    createOpaqueToken: () => 'opaque',
    AUTH_SESSION_TTL_HOURS: 12,
    serializeSessionCookie: () => 'projectory_session=fake',
    isValidEmail: () => true,
    verifyPassword: async () => true,
    buildAuthThrottleKey: () => 'k',
    getAuthProtectionConfig: () => ({ maxFailures: 5, windowMs: 1000, lockoutMs: 1000, backoffBaseMs: 1, backoffMaxMs: 10 }),
    getAuthThrottleState: () => ({ blocked: false, retryAfterMs: 0, failures: 0, locked: false }),
    emitAuthSecurityEvent: () => {},
    obfuscateSecurityKey: () => 'h',
    sendAuthThrottle: (res, message) => res.status(429).json({ error: message }),
    registerAuthFailure: () => ({ failures: 1, retryAfterMs: 100, locked: false }),
    sendAuthFailure: (res, statusCode, message) => res.status(statusCode).json({ error: message }),
    clearAuthFailureState: () => {},
    PASSWORD_RESET_TTL_MINUTES: 30,
    hashOpaqueToken: async () => 'hashed',
    createPasswordResetToken: async () => ({ token: 't', expiresAt: new Date().toISOString() }),
    resolveSmtpSettingsRow: async () => null,
    sendSmtpEmail: async () => {},
    buildForgotPasswordEmailBody: () => 'body',
    parseCookieHeader: () => new Map(),
    AUTH_SESSION_COOKIE: 'projectory_session',
    clearSessionCookie: () => 'projectory_session=; Max-Age=0',
    ...overrides
  };
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('logout revokes auth session from cookie and clears session cookie', async () => {
  const calls = [];
  const deps = createBaseDeps({
    parseCookieHeader: (rawCookie) => {
      assert.equal(rawCookie, 'projectory_session=abc123');
      return new Map([['projectory_session', 'abc123']]);
    },
    pool: {
      query: async (sql, params) => {
        calls.push({ sql: String(sql), params });
        return { rowCount: 1, rows: [] };
      }
    }
  });

  const handlers = buildAuthHandlers(deps);
  const req = { headers: { cookie: 'projectory_session=abc123' } };
  const res = createRes();

  await handlers.logout(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(Boolean(res.headers['set-cookie']), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sql.includes('UPDATE auth_sessions'), true);
  assert.deepEqual(calls[0].params, ['abc123']);
});
