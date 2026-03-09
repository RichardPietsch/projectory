const crypto = require('node:crypto');

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

// Keep policy intentionally simple for phase 1. Complexity can be tightened later.
function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < 12) {
    return 'Password must be at least 12 characters long.';
  }
  return null;
}

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (error, derivedKey) => {
      if (error) return reject(error);
      return resolve(derivedKey);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt);
  // format: v1$<salt>$<hash>
  return `v1$${salt}$${derived.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const raw = String(storedHash || '');
  const [version, salt, hashHex] = raw.split('$');
  if (version !== 'v1' || !salt || !hashHex) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, salt);
  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

module.exports = {
  validatePasswordStrength,
  hashPassword,
  verifyPassword
};
