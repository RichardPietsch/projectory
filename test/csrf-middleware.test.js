const test = require('node:test');
const assert = require('node:assert/strict');

const { createCsrfRuntime } = require('../src/app/csrf');

function createReq(overrides = {}) {
  const headers = Object.fromEntries(Object.entries(overrides.headers || {}).map(([k, v]) => [String(k).toLowerCase(), v]));
  return {
    method: 'POST',
    path: '/api/projects',
    auth: { authSource: 'session', sessionId: 'session-1' },
    header(name) {
      return headers[String(name).toLowerCase()];
    },
    ...overrides
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
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

test('requireSessionCsrf rejects missing token for session-authenticated mutating requests', () => {
  const runtime = createCsrfRuntime({ secret: 'secret-123' });
  const req = createReq();
  const res = createRes();
  let nextCalled = false;

  runtime.requireSessionCsrf(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'CSRF token missing.');
});

test('requireSessionCsrf rejects invalid token for session-authenticated mutating requests', () => {
  const runtime = createCsrfRuntime({ secret: 'secret-123' });
  const req = createReq({ headers: { 'x-csrf-token': 'invalid' } });
  const res = createRes();
  let nextCalled = false;

  runtime.requireSessionCsrf(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'CSRF token invalid.');
});

test('requireSessionCsrf accepts valid token for session-authenticated mutating requests', () => {
  const runtime = createCsrfRuntime({ secret: 'secret-123' });
  const token = runtime.issueToken('session-1');
  const req = createReq({ headers: { 'x-csrf-token': token } });
  const res = createRes();
  let nextCalled = false;

  runtime.requireSessionCsrf(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('requireSessionCsrf bypasses header-auth simulation mode', () => {
  const runtime = createCsrfRuntime({ secret: 'secret-123' });
  const req = createReq({ auth: { authSource: 'header', sessionId: null } });
  const res = createRes();
  let nextCalled = false;

  runtime.requireSessionCsrf(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('issueTokenHandler returns token for session-authenticated context', () => {
  const runtime = createCsrfRuntime({ secret: 'secret-123' });
  const req = createReq({ method: 'GET', path: '/api/auth/csrf-token' });
  const res = createRes();

  runtime.issueTokenHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body.token, 'string');
  assert.equal(res.body.token.length > 0, true);
});
