const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../src/app');
const { getPermissionsForRole, PERMISSIONS, hasPermission } = require('../src/auth/permissions');

test('permissions map resolves expected role capabilities', () => {
  const viewer = getPermissionsForRole('viewer');
  assert.equal(hasPermission(viewer, PERMISSIONS.PEOPLE_READ), true);
  assert.equal(hasPermission(viewer, PERMISSIONS.PEOPLE_WRITE), false);

  const admin = getPermissionsForRole('admin');
  assert.equal(hasPermission(admin, PERMISSIONS.ADMIN_ACCESS), true);

  const teammate = getPermissionsForRole('teammate');
  assert.equal(hasPermission(teammate, PERMISSIONS.PROJECTS_WRITE), true);
  assert.equal(hasPermission(teammate, PERMISSIONS.ADMIN_ACCESS), false);
});

test('GET /api/auth/me exposes derived auth context defaults', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.role, 'admin');
    assert.equal(Array.isArray(body.permissions), true);
    assert.equal(body.permissions.length > 0, true);
  } finally {
    server.close();
  }
});

test('GET /api/auth/me supports role override headers', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: {
        'x-projectory-user-role': 'viewer',
        'x-projectory-user-id': 'u-123',
        'x-projectory-user-email': 'viewer@example.com',
        'x-projectory-user-name': 'Viewer User'
      }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.role, 'viewer');
    assert.equal(body.userId, 'u-123');
    assert.equal(body.email, 'viewer@example.com');
    assert.equal(body.displayName, 'Viewer User');
    assert.equal(body.permissions.includes('people:write'), false);
  } finally {
    server.close();
  }
});
