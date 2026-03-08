const { getPermissionsForRole, hasPermission } = require('./permissions');
const { isHeaderSimulationEnabled } = require('./runtime');

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
  const headerSimulationEnabled = isHeaderSimulationEnabled();
  const defaultRole = String(process.env.AUTH_DEFAULT_ROLE || 'admin').trim().toLowerCase();
  const resolvedDefaultRole = headerSimulationEnabled ? defaultRole : 'viewer';
  const roleHeader = headerSimulationEnabled ? req.header(AUTH_HEADERS.USER_ROLE) : null;
  const role = String(roleHeader || resolvedDefaultRole).trim().toLowerCase();

  const personIdHeader = headerSimulationEnabled ? req.header(AUTH_HEADERS.USER_PERSON_ID) : null;

  req.auth = {
    userId: headerSimulationEnabled ? req.header(AUTH_HEADERS.USER_ID) || null : null,
    email: headerSimulationEnabled ? req.header(AUTH_HEADERS.USER_EMAIL) || null : null,
    displayName: headerSimulationEnabled ? req.header(AUTH_HEADERS.USER_NAME) || null : null,
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
