const test = require('node:test');
const assert = require('node:assert/strict');

const { validatePasswordStrength, hashPassword, verifyPassword } = require('../src/auth/passwords');
const { createOpaqueToken, hashOpaqueToken } = require('../src/auth/tokens');

test('password policy enforces minimum length', () => {
  assert.equal(validatePasswordStrength('short'), 'Password must be at least 12 characters long.');
  assert.equal(validatePasswordStrength('long-enough-secret'), null);
});

test('password hashing and verification roundtrip succeeds', async () => {
  const password = 'avery-secure-password';
  const hash = await hashPassword(password);

  assert.equal(hash.startsWith('v1$'), true);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
});

test('opaque token hashing is deterministic and non-empty', () => {
  const token = createOpaqueToken(24);
  const hashA = hashOpaqueToken(token);
  const hashB = hashOpaqueToken(token);

  assert.equal(token.length > 0, true);
  assert.equal(hashA, hashB);
  assert.equal(hashA.length, 64);
});
