const test = require('node:test');
const assert = require('node:assert/strict');

const { validatePasswordStrength, hashPassword, verifyPassword } = require('../src/auth/passwords');
const { createOpaqueToken, hashOpaqueToken } = require('../src/auth/tokens');

async function withEnv(overrides, fn) {
  const snapshot = {};
  for (const [key, value] of Object.entries(overrides)) {
    snapshot[key] = process.env[key];
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('password policy enforces baseline production controls', () => {
  assert.equal(validatePasswordStrength('short'), 'Password must be at least 12 characters long.');
  assert.equal(validatePasswordStrength('aaaaaaaaaaaa'), 'Password must include at least 8 unique characters.');
  assert.equal(validatePasswordStrength('aaaaaaaaaaaa!!!!'), 'Password must include at least 8 unique characters.');
  assert.equal(validatePasswordStrength('abcdefghijkk'), 'Password must include at least 2 of the following: lowercase letters, uppercase letters, numbers, and symbols.');
  assert.equal(validatePasswordStrength('abcdEFG1111!'), 'Password cannot contain more than 3 identical characters in a row.');
  assert.equal(validatePasswordStrength('Str0ng!Passphrase'), null);
});

test('password policy blocks obvious weak passwords with clear messaging', () => {
  assert.equal(validatePasswordStrength('Password123!!'), 'Password is too common or predictable. Choose a less obvious password.');
});

test('password policy is configurable via env for phased rollout', async () => {
  await withEnv({
    PASSWORD_MIN_LENGTH: '14',
    PASSWORD_MIN_UNIQUE_CHARS: '10',
    PASSWORD_MIN_CHARACTER_CLASSES: '3',
    PASSWORD_MAX_REPEATED_CHAR_RUN: '2',
    PASSWORD_ENFORCE_WEAK_DENYLIST: 'false'
  }, async () => {
    assert.equal(validatePasswordStrength('Abcd1234!xyz'), 'Password must be at least 14 characters long.');
    assert.equal(validatePasswordStrength('AAbbccddeeff11!!'), 'Password must include at least 10 unique characters.');
    assert.equal(validatePasswordStrength('abcdefghijklmn'), 'Password must include at least 3 of the following: lowercase letters, uppercase letters, numbers, and symbols.');
    assert.equal(validatePasswordStrength('AAAabcd1234!xyz'), 'Password cannot contain more than 2 identical characters in a row.');
    assert.equal(validatePasswordStrength('Password123!!'), 'Password must be at least 14 characters long.');
  });
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
