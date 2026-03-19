function buildRequestLogHeaders(req, allowlist) {
  const source = req.headers || {};
  const output = {};
  for (const [key, value] of Object.entries(source)) {
    const normalized = String(key || '').toLowerCase();
    if (!allowlist.has(normalized)) {
      continue;
    }
    output[normalized] = Array.isArray(value) ? value.join(',') : String(value || '');
  }
  return output;
}

function buildRequestLogBody(req, { obfuscateSecurityKey }) {
  if (!req.path.startsWith('/api/')) {
    return undefined;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const normalizedPath = String(req.path || '');

  if (normalizedPath === '/api/auth/login' || normalizedPath === '/api/auth/forgot-password') {
    return {
      emailHash: body.email ? obfuscateSecurityKey(String(body.email).toLowerCase().trim()) : null,
      credentialProvided: Boolean(body.password)
    };
  }

  if (normalizedPath === '/api/auth/reset-password' || normalizedPath === '/api/auth/accept-invite' || normalizedPath === '/api/auth/invite-preview') {
    return {
      resetOrInviteReferenceProvided: Boolean(body.token),
      credentialProvided: Boolean(body.password)
    };
  }

  return {
    fieldCount: Object.keys(body).length
  };
}

module.exports = {
  buildRequestLogHeaders,
  buildRequestLogBody
};
