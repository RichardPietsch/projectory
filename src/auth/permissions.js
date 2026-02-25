const PERMISSIONS = {
  PEOPLE_READ: 'people:read',
  PEOPLE_WRITE: 'people:write',
  CLIENTS_READ: 'clients:read',
  CLIENTS_WRITE: 'clients:write',
  PROJECTS_READ: 'projects:read',
  PROJECTS_WRITE: 'projects:write',
  ASSIGNMENTS_READ: 'assignments:read',
  ASSIGNMENTS_WRITE: 'assignments:write',
  IMPORT_RUN: 'import:run',
  EXPORT_RUN: 'export:run',
  ADMIN_ACCESS: 'admin:access'
};

const ROLE_PERMISSION_MAP = {
  admin: Object.values(PERMISSIONS),
  planner: [
    PERMISSIONS.PEOPLE_READ,
    PERMISSIONS.PEOPLE_WRITE,
    PERMISSIONS.CLIENTS_READ,
    PERMISSIONS.CLIENTS_WRITE,
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.PROJECTS_WRITE,
    PERMISSIONS.ASSIGNMENTS_READ,
    PERMISSIONS.ASSIGNMENTS_WRITE,
    PERMISSIONS.EXPORT_RUN
  ],
  viewer: [
    PERMISSIONS.PEOPLE_READ,
    PERMISSIONS.CLIENTS_READ,
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.ASSIGNMENTS_READ,
    PERMISSIONS.EXPORT_RUN
  ]
};

function getPermissionsForRole(roleName) {
  const role = String(roleName || '').trim().toLowerCase();
  return ROLE_PERMISSION_MAP[role] || [];
}

function hasPermission(permissions, requiredPermission) {
  return new Set(permissions || []).has(requiredPermission);
}

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSION_MAP,
  getPermissionsForRole,
  hasPermission
};
