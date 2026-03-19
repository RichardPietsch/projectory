const crypto = require('node:crypto');

const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_ALT_HEADER_NAME = 'x-xsrf-token';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function createCsrfRuntime({ secret }) {
  const normalizedSecret = String(secret || '').trim();
  if (!normalizedSecret) {
    throw new Error('CSRF secret is required.');
  }

  function issueToken(sessionId) {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) return '';
    return crypto
      .createHmac('sha256', normalizedSecret)
      .update(normalizedSessionId)
      .digest('base64url');
  }

  function safeEqual(left, right) {
    const leftBuf = Buffer.from(String(left || ''));
    const rightBuf = Buffer.from(String(right || ''));
    if (leftBuf.length === 0 || leftBuf.length !== rightBuf.length) return false;
    return crypto.timingSafeEqual(leftBuf, rightBuf);
  }

  function readCsrfToken(req) {
    const primary = String(req.header(CSRF_HEADER_NAME) || '').trim();
    if (primary) return primary;
    return String(req.header(CSRF_ALT_HEADER_NAME) || '').trim();
  }

  function requireSessionCsrf(req, res, next) {
    if (!MUTATING_METHODS.has(String(req.method || 'GET').toUpperCase())) {
      return next();
    }

    if (!String(req.path || '').startsWith('/api/')) {
      return next();
    }

    if (req.auth?.authSource !== 'session') {
      return next();
    }

    const sessionId = String(req.auth?.sessionId || '').trim();
    if (!sessionId) {
      return res.status(403).json({ error: 'CSRF validation failed.' });
    }

    const incoming = readCsrfToken(req);
    if (!incoming) {
      return res.status(403).json({ error: 'CSRF token missing.' });
    }

    const expected = issueToken(sessionId);
    if (!safeEqual(incoming, expected)) {
      return res.status(403).json({ error: 'CSRF token invalid.' });
    }

    return next();
  }

  function issueTokenHandler(req, res) {
    if (req.auth?.authSource !== 'session' || !req.auth?.sessionId) {
      return res.status(401).json({ error: 'Session authentication required.' });
    }

    return res.json({ token: issueToken(req.auth.sessionId) });
  }

  return {
    issueToken,
    requireSessionCsrf,
    issueTokenHandler
  };
}

module.exports = {
  CSRF_HEADER_NAME,
  createCsrfRuntime
};
