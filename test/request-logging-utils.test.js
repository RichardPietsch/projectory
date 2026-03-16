const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRequestLogHeaders, buildRequestLogBody } = require('../src/app/request-logging');

test('buildRequestLogHeaders enforces explicit header allowlist', () => {
  const req = {
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': 'corr-1',
      authorization: 'Bearer secret'
    }
  };

  const headers = buildRequestLogHeaders(req, new Set(['content-type', 'x-correlation-id']));
  assert.deepEqual(headers, {
    'content-type': 'application/json',
    'x-correlation-id': 'corr-1'
  });
});

test('buildRequestLogBody emits minimal route diagnostics', () => {
  const obfuscateSecurityKey = (value) => `hash:${value}`;

  const loginBody = buildRequestLogBody({
    path: '/api/auth/login',
    body: { email: 'User@Example.com', password: 'secret' }
  }, { obfuscateSecurityKey });

  assert.deepEqual(loginBody, {
    emailHash: 'hash:user@example.com',
    credentialProvided: true
  });

  const resetBody = buildRequestLogBody({
    path: '/api/auth/reset-password',
    body: { token: 'tok', password: 'pw' }
  }, { obfuscateSecurityKey });

  assert.deepEqual(resetBody, {
    resetOrInviteReferenceProvided: true,
    credentialProvided: true
  });

  const genericBody = buildRequestLogBody({
    path: '/api/projects',
    body: { name: 'A', description: 'B' }
  }, { obfuscateSecurityKey });

  assert.deepEqual(genericBody, { fieldCount: 2 });
});
