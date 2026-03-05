const { getPermissionsForRole, hasPermission } = require('./permissions');

// Header names used to simulate auth in local/dev requests.
const AUTH_HEADERS = {
  USER_ID: 'x-projectory-user-id',
  USER_EMAIL: 'x-projectory-user-email',
  USER_NAME: 'x-projectory-user-name',
  USER_ROLE: 'x-projectory-user-role',
  USER_PERSON_ID: 'x-projectory-person-id'
};

// Derive a lightweight auth context on every request.
function attachAuthContext(req, _res, next) {
  const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const defaultRole = String(process.env.AUTH_DEFAULT_ROLE || 'admin').trim().toLowerCase();
  const resolvedDefaultRole = isProduction ? 'viewer' : defaultRole;
  const roleHeader = isProduction ? null : req.header(AUTH_HEADERS.USER_ROLE);
  const role = String(roleHeader || resolvedDefaultRole).trim().toLowerCase();

  const personIdHeader = isProduction ? null : req.header(AUTH_HEADERS.USER_PERSON_ID);

  req.auth = {
    userId: isProduction ? null : req.header(AUTH_HEADERS.USER_ID) || null,
    email: isProduction ? null : req.header(AUTH_HEADERS.USER_EMAIL) || null,
    displayName: isProduction ? null : req.header(AUTH_HEADERS.USER_NAME) || null,
    personId: personIdHeader ? Number.parseInt(personIdHeader, 10) || null : null,
    role,
    permissions: getPermissionsForRole(role)
  };

  next();
}

// Route guard factory: blocks requests without the required permission.
function requirePermission(permission) {
  return function permissionGuard(req, res, next) {
    if (!req.auth) {
      return res.status(500).json({ error: 'Authentication context missing.' });
    }

    if (!hasPermission(req.auth.permissions, permission)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    return next();
  };
}

module.exports = {
  AUTH_HEADERS,
  attachAuthContext,
  requirePermission
};
