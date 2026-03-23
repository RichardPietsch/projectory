const crypto = require('node:crypto');

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '123456',
  '12345678',
  '123456789',
  'qwerty',
  'qwerty123',
  'letmein',
  'welcome',
  'admin',
  'admin123',
  'iloveyou',
  'changeme'
]);

function parseBooleanEnv(value, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function parseIntegerEnv(value, fallback, min = 0) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= min) {
    return Math.floor(numeric);
  }
  return fallback;
}

function getPasswordPolicy() {
  return {
    minLength: parseIntegerEnv(process.env.PASSWORD_MIN_LENGTH, 12, 8),
    minUniqueChars: parseIntegerEnv(process.env.PASSWORD_MIN_UNIQUE_CHARS, 8, 1),
    minCharacterClasses: parseIntegerEnv(process.env.PASSWORD_MIN_CHARACTER_CLASSES, 2, 1),
    maxRepeatedCharRun: parseIntegerEnv(process.env.PASSWORD_MAX_REPEATED_CHAR_RUN, 3, 1),
    enforceWeakPasswordDenylist: parseBooleanEnv(process.env.PASSWORD_ENFORCE_WEAK_DENYLIST, true)
  };
}

function countCharacterClasses(value) {
  let classes = 0;
  if (/[a-z]/.test(value)) classes += 1;
  if (/[A-Z]/.test(value)) classes += 1;
  if (/[0-9]/.test(value)) classes += 1;
  if (/[^A-Za-z0-9]/.test(value)) classes += 1;
  return classes;
}

function hasRepeatedRun(value, maxRun) {
  if (!value || maxRun < 1) return false;
  let runLength = 1;
  for (let i = 1; i < value.length; i += 1) {
    if (value[i] === value[i - 1]) {
      runLength += 1;
      if (runLength > maxRun) {
        return true;
      }
    } else {
      runLength = 1;
    }
  }
  return false;
}

function isObviousWeakPassword(value) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normalized) return true;
  if (COMMON_WEAK_PASSWORDS.has(normalized)) return true;
  if (/^(.)\1{5,}$/.test(normalized)) return true;
  if ('abcdefghijklmnopqrstuvwxyz'.includes(normalized) || '0123456789'.includes(normalized)) return true;
  return false;
}

function validatePasswordStrength(password) {
  const value = String(password || '');
  const policy = getPasswordPolicy();

  if (value.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters long.`;
  }

  const uniqueChars = new Set(value).size;
  if (uniqueChars < policy.minUniqueChars) {
    return `Password must include at least ${policy.minUniqueChars} unique characters.`;
  }

  const characterClasses = countCharacterClasses(value);
  if (characterClasses < policy.minCharacterClasses) {
    return `Password must include at least ${policy.minCharacterClasses} of the following: lowercase letters, uppercase letters, numbers, and symbols.`;
  }

  if (hasRepeatedRun(value, policy.maxRepeatedCharRun)) {
    return `Password cannot contain more than ${policy.maxRepeatedCharRun} identical characters in a row.`;
  }

  if (policy.enforceWeakPasswordDenylist && isObviousWeakPassword(value)) {
    return 'Password is too common or predictable. Choose a less obvious password.';
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
