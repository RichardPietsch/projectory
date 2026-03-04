const crypto = require('node:crypto');

// URL-safe random token used for invites/resets and session identifiers.
function createOpaqueToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('base64url');
}

// We never persist plaintext reset/invite tokens; hash before storing.
function hashOpaqueToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

module.exports = {
  createOpaqueToken,
  hashOpaqueToken
};
