-- Step 3 foundation: teammate role and scoped project access mapping.

CREATE TABLE IF NOT EXISTS user_project_access (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_user_project_access_user_id ON user_project_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_project_access_project_id ON user_project_access(project_id);

INSERT INTO roles (name)
VALUES ('teammate')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name = ANY(ARRAY[
  'people:read',
  'clients:read',
  'projects:read',
  'projects:write',
  'assignments:read',
  'assignments:write'
])
WHERE r.name = 'teammate'
ON CONFLICT DO NOTHING;
