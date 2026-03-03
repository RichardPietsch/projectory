const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { registerModuleRoutes } = require('./modules');
const { attachAuthContext, requirePermission } = require('./auth/middleware');
const { PERMISSIONS, getPermissionsForRole } = require('./auth/permissions');
const { validatePasswordStrength, hashPassword, verifyPassword } = require('./auth/passwords');
const { createOpaqueToken, hashOpaqueToken } = require('./auth/tokens');

// Single Express app serving API + static frontend.
const app = express();
const port = process.env.PORT || 3000;

// Shared Postgres connection pool used across modules/routes.
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'helloapp',
  user: process.env.DB_USER || 'hello',
  password: process.env.DB_PASSWORD || 'hello'
});

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const TRADE_CATALOG = [
  'UX', 'UI', 'DATA', 'STRATEGY', 'CONSULTING', 'DEV-FE', 'DEV-BE', 'DEV-FULLSTACK', 'DEV-OPS',
  'ART', 'COPY', 'CREATIVE', 'IT', 'HR', 'ACCOUNT', 'PO', 'TPM', 'MANAGEMENT', 'ADMIN', 'CONTROLLING',
  'TEMP', 'STUDENT'
];

const LEVEL_CATALOG = ['—', 'JUNIOR', 'MIDWEIGHT', 'SENIOR', 'DIRECTOR', 'C-LEVEL'];
const PROJECT_STATUS_VALUES = ['green', 'blue', 'yellow', 'red', 'white'];
const PEOPLE_STATUS_VALUES = ['active', 'paused', 'leaver'];

app.use(express.json());
app.use(attachAuthContext);
app.use(express.static(path.join(__dirname, '..', 'public')));

const AUTH_SESSION_COOKIE = 'projectory_session';
const AUTH_SESSION_TTL_HOURS = Number(process.env.AUTH_SESSION_TTL_HOURS || 12);
const PASSWORD_RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);

function parseCookieHeader(rawCookieHeader) {
  const cookieMap = new Map();
  const value = String(rawCookieHeader || '').trim();
  if (!value) return cookieMap;

  for (const part of value.split(';')) {
    const [rawKey, ...rawValueParts] = part.split('=');
    const key = String(rawKey || '').trim();
    if (!key) continue;
    cookieMap.set(key, decodeURIComponent(rawValueParts.join('=').trim()));
  }

  return cookieMap;
}

function serializeSessionCookie(sessionId, expiresAt) {
  const maxAgeSeconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const secureAttribute = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${AUTH_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureAttribute}`;
}

function clearSessionCookie() {
  const secureAttribute = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${AUTH_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttribute}`;
}


async function loadSessionAuthContext(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const sessionId = cookies.get(AUTH_SESSION_COOKIE);
  if (!sessionId) return null;

  const result = await pool.query(
    `SELECT s.id AS session_id,
            s.expires_at,
            s.revoked_at,
            u.id AS user_id,
            u.email,
            u.display_name,
            u.person_id,
            COALESCE(ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles,
            COALESCE(ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), ARRAY[]::text[]) AS db_permissions
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     WHERE s.id = $1
     GROUP BY s.id, s.expires_at, s.revoked_at, u.id, u.email, u.display_name, u.person_id`,
    [sessionId]
  );

  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  if (row.revoked_at) return null;
  const expiry = new Date(row.expires_at);
  if (expiry.getTime() <= Date.now()) return null;

  const roles = (row.roles || []).map((role) => String(role || '').toLowerCase()).filter(Boolean);
  const role = roles[0] || 'viewer';
  const mergedPermissions = new Set([...(row.db_permissions || []), ...getPermissionsForRole(role)]);

  return {
    sessionId: row.session_id,
    userId: String(row.user_id),
    email: row.email,
    displayName: row.display_name,
    personId: row.person_id ? Number(row.person_id) : null,
    role,
    roles,
    permissions: [...mergedPermissions]
  };
}

// Session auth overlay: for requests with a valid session cookie we override header simulation context.
app.use(async (req, _res, next) => {
  try {
    const sessionAuth = await loadSessionAuthContext(req);
    if (sessionAuth) {
      req.auth = {
        ...req.auth,
        ...sessionAuth,
        authSource: 'session'
      };

      await pool.query(
        `UPDATE auth_sessions
         SET last_seen_at = NOW()
         WHERE id = $1`,
        [sessionAuth.sessionId]
      );
    } else {
      req.auth = {
        ...req.auth,
        authSource: 'header'
      };
    }
  } catch (_error) {
    // Keep app available even when auth storage is unavailable; header simulation remains fallback.
    req.auth = {
      ...req.auth,
      authSource: 'header'
    };
  }

  next();
});

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'off', 'no'].includes(normalized)) return false;
  return null;
}

function parseWorkingHours(value) {
  if (value === undefined || value === null || value === '') return 40;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

// Normalize common Postgres errors into stable API responses.
function handleDbError(res, error) {
  if (error.code === '23503') {
    return res.status(409).json({ error: 'Cannot delete record because dependencies exist.' });
  }

  if (error.code === '23514') {
    return res.status(400).json({ error: 'Validation error.' });
  }

  if (error.code === '23505') {
    return res.status(409).json({ error: 'Duplicate value conflict.' });
  }

  console.error(error);
  return res.status(500).json({ error: 'Unexpected server error.' });
}

function requireMonth(value, fieldName) {
  if (!MONTH_REGEX.test(value || '')) {
    return `${fieldName} must be in yyyy-mm format.`;
  }
  return null;
}

function normalizeProjectStatus(status, fallback = 'white') {
  const normalized = String(status || '').trim().toLowerCase();
  if (PROJECT_STATUS_VALUES.includes(normalized)) return normalized;
  return fallback;
}


function normalizePeopleStatus(status, fallback = 'active') {
  const normalized = String(status || '').trim().toLowerCase();
  if (PEOPLE_STATUS_VALUES.includes(normalized)) return normalized;
  return fallback;
}

async function getPersonProjectTotalQuantity(personId, projectId, client = pool) {
  const result = await client.query(
    `SELECT COALESCE(SUM(quantity), 0) AS total_quantity
     FROM assignments
     WHERE person_id = $1 AND project_id = $2`,
    [personId, projectId]
  );

  return Number(result.rows[0]?.total_quantity || 0);
}

// Keep assignment quantity split consistent per person+project (sum = target).
async function distributeProjectQuantityAcrossAssignments(personId, projectId, totalQuantity, client = pool) {
  const assignments = await client.query(
    `SELECT id
     FROM assignments
     WHERE person_id = $1 AND project_id = $2
     ORDER BY id`,
    [personId, projectId]
  );

  const count = assignments.rowCount;
  if (count === 0) {
    return;
  }

  const totalBps = Math.round(Number(totalQuantity) * 100);
  const baseBps = Math.floor(totalBps / count);
  let remaining = totalBps;

  for (let i = 0; i < count; i += 1) {
    const bps = i === count - 1 ? remaining : baseBps;
    remaining -= bps;
    const quantity = (bps / 100).toFixed(2);

    await client.query(
      `UPDATE assignments
       SET quantity = $1
       WHERE id = $2`,
      [quantity, assignments.rows[i].id]
    );
  }
}


async function ensurePriorityCatalog() {
  const targetPriorities = [
    '⭐️ Hero',
    '✨ Rising Star',
    '☑️ Solid',
    '🛠️ Maintenance',
    '🔬 Small Client',
    '❌ Outphasing'
  ];

  const legacyToTarget = [
    ['Prio 1', '⭐️ Hero'],
    ['Prio 2', '✨ Rising Star'],
    ['Prio 3', '☑️ Solid'],
    ['Prio 4', '🛠️ Maintenance']
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [legacyName, targetName] of legacyToTarget) {
      await client.query(
        `UPDATE priorities
         SET name = $1
         WHERE name = $2
           AND NOT EXISTS (SELECT 1 FROM priorities p2 WHERE p2.name = $1)`,
        [targetName, legacyName]
      );
    }

    await client.query(
      `INSERT INTO priorities (name)
       SELECT value
       FROM UNNEST($1::text[]) AS value
       ON CONFLICT (name) DO NOTHING`,
      [targetPriorities]
    );

    const byName = await client.query(
      `SELECT id, name FROM priorities WHERE name = ANY($1::text[])`,
      [[...targetPriorities, ...legacyToTarget.map(([legacy]) => legacy)]]
    );
    const idByName = new Map(byName.rows.map((row) => [row.name, row.id]));

    for (const [legacyName, targetName] of legacyToTarget) {
      const legacyId = idByName.get(legacyName);
      const targetId = idByName.get(targetName);
      if (legacyId && targetId && legacyId !== targetId) {
        await client.query(
          `UPDATE clients
           SET priority_id = $1
           WHERE priority_id = $2`,
          [targetId, legacyId]
        );
      }
    }

    await client.query(
      `DELETE FROM priorities p
       WHERE p.name = ANY($1::text[])
         AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.priority_id = p.id)`,
      [legacyToTarget.map(([legacyName]) => legacyName)]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ensurePeopleCatalog() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO trades (name)
       SELECT value
       FROM UNNEST($1::text[]) AS value
       ON CONFLICT (name) DO NOTHING`,
      [TRADE_CATALOG]
    );

    await client.query(
      `INSERT INTO levels (name)
       SELECT value
       FROM UNNEST($1::text[]) AS value
       ON CONFLICT (name) DO NOTHING`,
      [LEVEL_CATALOG]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ensureProjectStatusColumn() {
  await pool.query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'white'
    CHECK (status IN ('green', 'blue', 'yellow', 'red', 'white'))
  `);
}

async function ensurePeopleFlagsColumns() {
  await pool.query(`
    ALTER TABLE people
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN
  `);

  await pool.query(`
    ALTER TABLE people
    ADD COLUMN IF NOT EXISTS is_leaver BOOLEAN
  `);
}


async function ensurePeopleStatusColumn() {
  await pool.query(`
    ALTER TABLE people
    ADD COLUMN IF NOT EXISTS status TEXT
  `);

  await pool.query(`
    UPDATE people
    SET status = CASE
      WHEN COALESCE(is_leaver, FALSE) THEN 'leaver'
      ELSE 'active'
    END
    WHERE status IS NULL
  `);

  await pool.query(`
    ALTER TABLE people
    ALTER COLUMN status SET DEFAULT 'active'
  `);

  await pool.query(`
    ALTER TABLE people
    ALTER COLUMN status SET NOT NULL
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'people_status_allowed'
      ) THEN
        ALTER TABLE people
        ADD CONSTRAINT people_status_allowed CHECK (status IN ('active', 'paused', 'leaver'));
      END IF;
    END $$;
  `);
}

async function ensurePeopleWorkingHoursColumn() {
  await pool.query(`
    ALTER TABLE people
    ADD COLUMN IF NOT EXISTS working_hours INTEGER NOT NULL DEFAULT 40
  `);

  await pool.query('UPDATE people SET working_hours = 40 WHERE working_hours IS NULL');
}

async function getPeopleCatalogLookups(client = pool) {
  const [trades, levels] = await Promise.all([
    client.query('SELECT id, name FROM trades ORDER BY name'),
    client.query('SELECT id, name FROM levels ORDER BY name')
  ]);

  return {
    tradeByName: new Map(trades.rows.map((row) => [String(row.name).toUpperCase(), row.id])),
    levelByName: new Map(levels.rows.map((row) => [String(row.name).toUpperCase(), row.id]))
  };
}


app.get('/api/auth/me', (req, res) => {
  res.json({
    userId: req.auth.userId,
    email: req.auth.email,
    displayName: req.auth.displayName,
    personId: req.auth.personId || null,
    role: req.auth.role,
    roles: req.auth.roles || [req.auth.role],
    permissions: req.auth.permissions,
    authSource: req.auth.authSource || 'header'
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return badRequest(res, 'email and password are required.');
  }

  try {
    const userResult = await pool.query(
      `SELECT id, email, display_name, person_id, password_hash, is_active, failed_login_count, locked_until
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [String(email).trim()]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is inactive.' });
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return res.status(423).json({ error: 'Account temporarily locked. Please try again later.' });
    }

    const isValid = user.password_hash ? await verifyPassword(password, user.password_hash) : false;
    if (!isValid) {
      await pool.query(
        `UPDATE users
         SET failed_login_count = failed_login_count + 1,
             locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
         WHERE id = $1`,
        [user.id]
      );
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const sessionId = createOpaqueToken(48);
    const expiresAt = new Date(Date.now() + (AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000));

    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, user.id, expiresAt.toISOString(), req.ip || null, req.header('user-agent') || null]
    );

    await pool.query(
      `UPDATE users
       SET failed_login_count = 0,
           locked_until = NULL,
           last_login_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    res.setHeader('Set-Cookie', serializeSessionCookie(sessionId, expiresAt));
    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const sessionId = parseCookieHeader(req.headers.cookie).get(AUTH_SESSION_COOKIE);
    if (sessionId) {
      await pool.query(
        `UPDATE auth_sessions
         SET revoked_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );
    }
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!email) {
    return badRequest(res, 'email is required.');
  }

  try {
    const userResult = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE LIMIT 1`,
      [email]
    );

    if (userResult.rowCount > 0) {
      const token = createOpaqueToken(32);
      const tokenHash = hashOpaqueToken(token);
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
         VALUES ($1, $2, NOW() + ($3::text || ' minutes')::interval, $4)`,
        [userResult.rows[0].id, tokenHash, String(PASSWORD_RESET_TTL_MINUTES), req.ip || null]
      );

      if (process.env.AUTH_RETURN_DEBUG_TOKENS === 'true') {
        return res.json({ ok: true, debugToken: token });
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || !password) {
    return badRequest(res, 'token and password are required.');
  }

  const validationError = validatePasswordStrength(password);
  if (validationError) {
    return badRequest(res, validationError);
  }

  const tokenHash = hashOpaqueToken(token);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (tokenResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    const passwordHash = await hashPassword(password);

    await client.query(
      `UPDATE users
       SET password_hash = $1,
           failed_login_count = 0,
           locked_until = NULL
       WHERE id = $2`,
      [passwordHash, tokenResult.rows[0].user_id]
    );

    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [tokenResult.rows[0].id]
    );

    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    client.release();
  }
});

app.get('/api/meta', async (_req, res) => {
  try {
    const [priorities, trades, levels] = await Promise.all([
      pool.query('SELECT id, name FROM priorities ORDER BY id'),
      pool.query('SELECT id, name FROM trades ORDER BY name'),
      pool.query('SELECT id, name FROM levels ORDER BY name')
    ]);

    res.json({
      priorities: priorities.rows,
      trades: trades.rows,
      levels: levels.rows
    });
  } catch (error) {
    handleDbError(res, error);
  }
});

// Register modular domains first; legacy routes remain below as incremental refactor targets.
registerModuleRoutes(app, {
  pool,
  badRequest,
  handleDbError,
  parseOptionalBoolean,
  parseWorkingHours,
  requirePermission,
  PERMISSIONS,
  requireMonth
});

// Legacy project/challenge/assignment endpoints (permission-gated).
app.get('/api/projects', requirePermission(PERMISSIONS.PROJECTS_READ), async (_req, res) => {
  try {
    const projects = await pool.query(
      `SELECT p.id, p.name, p.status, p.start_month, p.end_month, p.budget_cents,
              c.id AS client_id, c.name AS client_name,
              pr.id AS priority_id, pr.name AS priority_name
       FROM projects p
       JOIN clients c ON p.client_id = c.id
       JOIN priorities pr ON c.priority_id = pr.id
       ORDER BY p.created_at DESC`
    );

    const challenges = await pool.query(
      `SELECT ch.id, ch.project_id, ch.title, ch.description,
              COALESCE(COUNT(a.id), 0) AS assignment_count,
              COALESCE(SUM(a.quantity), 0) AS assignment_quantity_total
       FROM challenges ch
       LEFT JOIN assignments a ON a.challenge_id = ch.id
       GROUP BY ch.id
       ORDER BY ch.created_at DESC`
    );

    const assignments = await pool.query(
      `SELECT a.id, a.project_id, a.challenge_id, a.person_id,
              a.is_owner, a.is_leader, a.quantity,
              pe.first_name, pe.last_name, COALESCE(pe.is_leaver, FALSE) AS is_leaver, pe.working_hours, ch.title AS challenge_title
       FROM assignments a
       JOIN people pe ON pe.id = a.person_id
       JOIN challenges ch ON ch.id = a.challenge_id
       ORDER BY a.created_at DESC`
    );

    res.json({
      projects: projects.rows,
      challenges: challenges.rows,
      assignments: assignments.rows
    });
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post('/api/projects', requirePermission(PERMISSIONS.PROJECTS_WRITE), async (req, res) => {
  const { clientId, name, status, startMonth, endMonth, budgetEuros, budgetCents } = req.body;

  if (!clientId || !name || !startMonth || (budgetEuros === undefined && budgetCents === undefined)) {
    return badRequest(res, 'clientId, name, startMonth and budgetEuros are required.');
  }

  const startError = requireMonth(startMonth, 'startMonth');
  if (startError) {
    return badRequest(res, startError);
  }

  if (endMonth && requireMonth(endMonth, 'endMonth')) {
    return badRequest(res, 'endMonth must be in yyyy-mm format.');
  }

  try {
    const normalizedBudgetCents = budgetEuros !== undefined
      ? Math.round(Number(budgetEuros) * 100)
      : Number(budgetCents);

    if (!Number.isFinite(normalizedBudgetCents) || normalizedBudgetCents < 0) {
      return badRequest(res, 'budgetEuros must be a positive number.');
    }

    const result = await pool.query(
      `INSERT INTO projects (client_id, name, status, start_month, end_month, budget_cents)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [clientId, name.trim(), normalizeProjectStatus(status), startMonth, endMonth || null, normalizedBudgetCents]
    );

    return res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.put('/api/projects/:id', requirePermission(PERMISSIONS.PROJECTS_WRITE), async (req, res) => {
  const { clientId, name, status, startMonth, endMonth, budgetEuros, budgetCents } = req.body;

  if (!clientId || !name || !startMonth || (budgetEuros === undefined && budgetCents === undefined)) {
    return badRequest(res, 'clientId, name, startMonth and budgetEuros are required.');
  }

  const startError = requireMonth(startMonth, 'startMonth');
  if (startError) {
    return badRequest(res, startError);
  }

  if (endMonth && requireMonth(endMonth, 'endMonth')) {
    return badRequest(res, 'endMonth must be in yyyy-mm format.');
  }

  try {
    const normalizedBudgetCents = budgetEuros !== undefined
      ? Math.round(Number(budgetEuros) * 100)
      : Number(budgetCents);

    if (!Number.isFinite(normalizedBudgetCents) || normalizedBudgetCents < 0) {
      return badRequest(res, 'budgetEuros must be a positive number.');
    }

    const result = await pool.query(
      `UPDATE projects
       SET client_id = $1, name = $2, status = $3, start_month = $4, end_month = $5, budget_cents = $6
       WHERE id = $7`,
      [clientId, name.trim(), normalizeProjectStatus(status), startMonth, endMonth || null, normalizedBudgetCents, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.delete('/api/projects/:id', requirePermission(PERMISSIONS.PROJECTS_WRITE), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/projects/:projectId/challenges', requirePermission(PERMISSIONS.PROJECTS_WRITE), async (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) {
    return badRequest(res, 'title and description are required.');
  }

  try {
    const result = await pool.query(
      `INSERT INTO challenges (project_id, title, description)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [req.params.projectId, title.trim(), description.trim()]
    );

    return res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.put('/api/challenges/:id', requirePermission(PERMISSIONS.PROJECTS_WRITE), async (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) {
    return badRequest(res, 'title and description are required.');
  }

  try {
    const result = await pool.query(
      `UPDATE challenges
       SET title = $1, description = $2
       WHERE id = $3`,
      [title.trim(), description.trim(), req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Challenge not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.delete('/api/challenges/:id', requirePermission(PERMISSIONS.PROJECTS_WRITE), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM challenges WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Challenge not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/assignments', requirePermission(PERMISSIONS.ASSIGNMENTS_WRITE), async (req, res) => {
  const { projectId, challengeId, personId, isOwner, isLeader } = req.body;

  if (!projectId || !challengeId || !personId) {
    return badRequest(res, 'projectId, challengeId and personId are required.');
  }

  if (isOwner && isLeader) {
    return badRequest(res, 'Assignment cannot be both owner and leader.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const challengeResult = await client.query(
      'SELECT id FROM challenges WHERE id = $1 AND project_id = $2',
      [challengeId, projectId]
    );

    if (challengeResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Challenge must belong to the selected project.' });
    }

    const existing = await client.query(
      `SELECT id
       FROM assignments
       WHERE challenge_id = $1 AND person_id = $2
       LIMIT 1`,
      [challengeId, personId]
    );

    if (existing.rowCount > 0) {
      await client.query(
        `UPDATE assignments
         SET is_owner = $1, is_leader = $2
         WHERE id = $3`,
        [Boolean(isOwner), Boolean(isLeader), existing.rows[0].id]
      );

      await client.query('COMMIT');
      return res.json({ id: existing.rows[0].id, deduplicated: true });
    }

    const currentProjectTotal = await getPersonProjectTotalQuantity(personId, projectId, client);

    const inserted = await client.query(
      `INSERT INTO assignments (project_id, challenge_id, person_id, is_owner, is_leader)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [projectId, challengeId, personId, Boolean(isOwner), Boolean(isLeader)]
    );

    const targetProjectTotal = currentProjectTotal > 0 ? currentProjectTotal : 100;
    await distributeProjectQuantityAcrossAssignments(personId, projectId, targetProjectTotal, client);

    await client.query('COMMIT');
    return res.status(201).json({ id: inserted.rows[0].id });
  } catch (error) {
    await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    client.release();
  }
});

app.put('/api/assignments/:id', requirePermission(PERMISSIONS.ASSIGNMENTS_WRITE), async (req, res) => {
  const { isOwner, isLeader } = req.body;

  if (isOwner && isLeader) {
    return badRequest(res, 'Assignment cannot be both owner and leader.');
  }

  try {
    const result = await pool.query(
      `UPDATE assignments
       SET is_owner = $1, is_leader = $2
       WHERE id = $3`,
      [Boolean(isOwner), Boolean(isLeader), req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});


app.put('/api/projects/:projectId/people/:personId/quantity', requirePermission(PERMISSIONS.ASSIGNMENTS_WRITE), async (req, res) => {
  const quantity = Number(req.body.quantity);

  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100) {
    return badRequest(res, 'quantity must be an integer between 0 and 100.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const assignments = await client.query(
      `SELECT id
       FROM assignments
       WHERE project_id = $1 AND person_id = $2`,
      [req.params.projectId, req.params.personId]
    );

    if (assignments.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No assignments found for this person in the selected project.' });
    }

    await distributeProjectQuantityAcrossAssignments(req.params.personId, req.params.projectId, quantity, client);

    await client.query('COMMIT');
    return res.json({ ok: true, updated: assignments.rowCount, projectQuantity: quantity });
  } catch (error) {
    await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    client.release();
  }
});

app.delete('/api/assignments/:id', requirePermission(PERMISSIONS.ASSIGNMENTS_WRITE), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const assignment = await client.query(
      'SELECT person_id, project_id FROM assignments WHERE id = $1',
      [req.params.id]
    );
    if (assignment.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found.' });
    }

    const personId = assignment.rows[0].person_id;
    const projectId = assignment.rows[0].project_id;
    const projectTotalBeforeDelete = await getPersonProjectTotalQuantity(personId, projectId, client);

    await client.query('DELETE FROM assignments WHERE id = $1', [req.params.id]);
    await distributeProjectQuantityAcrossAssignments(personId, projectId, projectTotalBeforeDelete, client);

    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    client.release();
  }
});


// Data portability endpoints (export/import) use stricter permissions.
app.get('/api/export', requirePermission(PERMISSIONS.EXPORT_RUN), async (req, res) => {
  try {
    const [clients, projects, people, challenges, assignments] = await Promise.all([
      pool.query('SELECT id, name, location, since_month, priority_id FROM clients ORDER BY id'),
      pool.query('SELECT id, client_id, name, status, start_month, end_month, budget_cents FROM projects ORDER BY id'),
      pool.query(
        `SELECT p.id, p.first_name, p.last_name, t.name AS trade, l.name AS level,
                COALESCE(p.is_hidden, FALSE) AS is_hidden, COALESCE(p.is_leaver, FALSE) AS is_leaver, p.status, p.working_hours
         FROM people p
         JOIN trades t ON p.trade_id = t.id
         JOIN levels l ON p.level_id = l.id
         ORDER BY p.id`
      ),
      pool.query('SELECT id, project_id, title, description FROM challenges ORDER BY id'),
      pool.query('SELECT id, project_id, challenge_id, person_id, is_owner, is_leader, quantity FROM assignments ORDER BY id')
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      data: {
        clients: clients.rows,
        projects: projects.rows,
        people: people.rows,
        challenges: challenges.rows,
        assignments: assignments.rows
      }
    };

    if ((req.query.format || '').toLowerCase() === 'csv') {
      const csv = payloadToCsv(payload.data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="projectory-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }

    return res.json(payload);
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.get('/api/export/config', requirePermission(PERMISSIONS.EXPORT_RUN), async (req, res) => {
  try {
    const [trades, levels] = await Promise.all([
      pool.query('SELECT id, name FROM trades ORDER BY name'),
      pool.query('SELECT id, name FROM levels ORDER BY name')
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      data: {
        trades: trades.rows,
        levels: levels.rows
      }
    };

    if ((req.query.format || '').toLowerCase() === 'csv') {
      const csv = configurationPayloadToCsv(payload.data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="projectory-configuration-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }

    return res.json(payload);
  } catch (error) {
    return handleDbError(res, error);
  }
});

function normalizeConfigurationItems(list, label) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }

  const normalized = list
    .map((item) => {
      if (typeof item === 'string') {
        return { id: null, name: item };
      }
      return {
        id: Number.isInteger(Number(item?.id)) ? Number(item.id) : null,
        name: item?.name
      };
    })
    .map((item) => ({ id: item.id, name: String(item.name || '').trim() }))
    .filter((item) => item.name);

  if (normalized.length === 0) {
    throw new Error(`${label} must contain at least one non-empty value.`);
  }

  if (new Set(normalized.map((value) => value.name.toLowerCase())).size !== normalized.length) {
    throw new Error(`${label} contains duplicate values.`);
  }

  const ids = normalized.filter((item) => Number.isInteger(item.id) && item.id > 0).map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} contains duplicate ids.`);
  }

  return normalized;
}

app.get('/api/configuration', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (_req, res) => {
  try {
    const [trades, levels] = await Promise.all([
      pool.query(
        `SELECT t.id, t.name, COUNT(p.id)::int AS usage_count
         FROM trades t
         LEFT JOIN people p ON p.trade_id = t.id
         GROUP BY t.id, t.name
         ORDER BY t.name`
      ),
      pool.query(
        `SELECT l.id, l.name, COUNT(p.id)::int AS usage_count
         FROM levels l
         LEFT JOIN people p ON p.level_id = l.id
         GROUP BY l.id, l.name
         ORDER BY l.name`
      )
    ]);

    return res.json({ trades: trades.rows, levels: levels.rows });
  } catch (error) {
    return handleDbError(res, error);
  }
});

async function applyConfigurationCatalog({ trades, levels }) {
  const nextTrades = normalizeConfigurationItems(trades, 'trades');
  const nextLevels = normalizeConfigurationItems(levels, 'levels');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const [existingTrades, existingLevels] = await Promise.all([
      client.query(
        `SELECT t.id, t.name, COUNT(p.id)::int AS usage_count
         FROM trades t
         LEFT JOIN people p ON p.trade_id = t.id
         GROUP BY t.id, t.name`
      ),
      client.query(
        `SELECT l.id, l.name, COUNT(p.id)::int AS usage_count
         FROM levels l
         LEFT JOIN people p ON p.level_id = l.id
         GROUP BY l.id, l.name`
      )
    ]);

    const tradeById = new Map(existingTrades.rows.map((row) => [Number(row.id), row]));
    const levelById = new Map(existingLevels.rows.map((row) => [Number(row.id), row]));

    for (const item of nextTrades) {
      if (item.id && !tradeById.has(item.id)) {
        throw new Error(`Trade id '${item.id}' does not exist.`);
      }
    }
    for (const item of nextLevels) {
      if (item.id && !levelById.has(item.id)) {
        throw new Error(`Level id '${item.id}' does not exist.`);
      }
    }

    const nextTradeIds = new Set(nextTrades.filter((item) => item.id).map((item) => item.id));
    for (const row of existingTrades.rows) {
      const rowId = Number(row.id);
      if (!nextTradeIds.has(rowId) && Number(row.usage_count || 0) > 0) {
        throw new Error(`Trade '${row.name}' is in use and cannot be removed.`);
      }
    }

    const nextLevelIds = new Set(nextLevels.filter((item) => item.id).map((item) => item.id));
    for (const row of existingLevels.rows) {
      const rowId = Number(row.id);
      if (!nextLevelIds.has(rowId) && Number(row.usage_count || 0) > 0) {
        throw new Error(`Level '${row.name}' is in use and cannot be removed.`);
      }
    }

    for (const item of nextTrades.filter((item) => item.id)) {
      await client.query('UPDATE trades SET name = $1 WHERE id = $2', [item.name, item.id]);
    }
    for (const item of nextLevels.filter((item) => item.id)) {
      await client.query('UPDATE levels SET name = $1 WHERE id = $2', [item.name, item.id]);
    }

    const deleteTradeIds = existingTrades.rows
      .map((row) => Number(row.id))
      .filter((id) => !nextTradeIds.has(id));
    const deleteLevelIds = existingLevels.rows
      .map((row) => Number(row.id))
      .filter((id) => !nextLevelIds.has(id));

    if (deleteTradeIds.length > 0) {
      await client.query('DELETE FROM trades WHERE id = ANY($1::int[])', [deleteTradeIds]);
    }
    if (deleteLevelIds.length > 0) {
      await client.query('DELETE FROM levels WHERE id = ANY($1::int[])', [deleteLevelIds]);
    }

    const newTradeNames = nextTrades.filter((item) => !item.id).map((item) => item.name);
    const newLevelNames = nextLevels.filter((item) => !item.id).map((item) => item.name);

    if (newTradeNames.length > 0) {
      await client.query(
        `INSERT INTO trades (name)
         SELECT value FROM UNNEST($1::text[]) AS value`,
        [newTradeNames]
      );
    }
    if (newLevelNames.length > 0) {
      await client.query(
        `INSERT INTO levels (name)
         SELECT value FROM UNNEST($1::text[]) AS value`,
        [newLevelNames]
      );
    }

    await client.query('COMMIT');
    return { trades: nextTrades.length, levels: nextLevels.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

app.put('/api/configuration', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  try {
    await applyConfigurationCatalog({ trades: req.body?.trades, levels: req.body?.levels });
    return res.json({ ok: true });
  } catch (error) {
    return badRequest(res, error.message || 'Invalid configuration payload.');
  }
});

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function ensureNoDuplicateIds(rows, entityName) {
  const ids = rows.map((row) => row.id);
  if (new Set(ids).size !== ids.length) {
    return `${entityName} contains duplicate ids.`;
  }
  return null;
}

function validateImportPayload(payload) {
  const requiredArrays = ['clients', 'projects', 'people', 'challenges', 'assignments'];
  for (const key of requiredArrays) {
    if (!Array.isArray(payload[key])) {
      return `Import payload missing array: ${key}`;
    }
  }

  const duplicateChecks = [
    ['clients', payload.clients],
    ['projects', payload.projects],
    ['people', payload.people],
    ['challenges', payload.challenges],
    ['assignments', payload.assignments]
  ];

  for (const [entityName, rows] of duplicateChecks) {
    const duplicateError = ensureNoDuplicateIds(rows, entityName);
    if (duplicateError) {
      return duplicateError;
    }
  }

  const clientIds = new Set(payload.clients.map((row) => row.id));
  const projectIds = new Set(payload.projects.map((row) => row.id));
  const peopleIds = new Set(payload.people.map((row) => row.id));
  const challengeIds = new Set(payload.challenges.map((row) => row.id));

  for (const row of payload.clients) {
    if (!isPositiveInteger(row.id) || !row.name || !row.location || !MONTH_REGEX.test(row.since_month || '') || !isPositiveInteger(row.priority_id)) {
      return `Invalid client row with id ${row.id}.`;
    }
  }

  for (const row of payload.projects) {
    if (!isPositiveInteger(row.id) || !clientIds.has(row.client_id) || !row.name || !MONTH_REGEX.test(row.start_month || '') || !isNonNegativeInteger(row.budget_cents)) {
      return `Invalid project row with id ${row.id}.`;
    }

    if (!PROJECT_STATUS_VALUES.includes(String(row.status || '').toLowerCase())) {
      return `Invalid project status in project id ${row.id}.`;
    }

    if (row.end_month && !MONTH_REGEX.test(row.end_month)) {
      return `Invalid end_month in project id ${row.id}.`;
    }
  }

  for (const row of payload.people) {
    if (!isPositiveInteger(row.id) || !row.first_name || !row.last_name || !isPositiveInteger(row.trade_id) || !isPositiveInteger(row.level_id)) {
      return `Invalid person row with id ${row.id}.`;
    }

    if (row.is_hidden !== undefined && row.is_hidden !== null && typeof row.is_hidden !== 'boolean') {
      return `Invalid is_hidden flag in person row with id ${row.id}.`;
    }

    if (row.is_leaver !== undefined && row.is_leaver !== null && typeof row.is_leaver !== 'boolean') {
      return `Invalid is_leaver flag in person row with id ${row.id}.`;
    }

    if (row.working_hours !== undefined && row.working_hours !== null && !isPositiveInteger(row.working_hours)) {
      return `Invalid working_hours in person row with id ${row.id}.`;
    }

    if (row.status !== undefined && row.status !== null && !PEOPLE_STATUS_VALUES.includes(String(row.status).toLowerCase())) {
      return `Invalid status in person row with id ${row.id}.`;
    }
  }

  for (const row of payload.challenges) {
    if (!isPositiveInteger(row.id) || !projectIds.has(row.project_id) || !row.title || !row.description) {
      return `Invalid challenge row with id ${row.id}.`;
    }
  }

  for (const row of payload.assignments) {
    if (!isPositiveInteger(row.id) || !projectIds.has(row.project_id) || !challengeIds.has(row.challenge_id) || !peopleIds.has(row.person_id)) {
      return `Invalid assignment row with id ${row.id}.`;
    }

    if (typeof row.is_owner !== 'boolean' || typeof row.is_leader !== 'boolean' || (row.is_owner && row.is_leader)) {
      return `Invalid owner/leader flags in assignment id ${row.id}.`;
    }

    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 100) {
      return `Invalid quantity in assignment id ${row.id}.`;
    }
  }

  const challengeProjectMap = new Map(payload.challenges.map((row) => [row.id, row.project_id]));
  for (const row of payload.assignments) {
    if (challengeProjectMap.get(row.challenge_id) !== row.project_id) {
      return `Assignment id ${row.id} links challenge to a different project.`;
    }
  }

  return null;
}

async function normalizeImportPeople(payload) {
  const { tradeByName, levelByName } = await getPeopleCatalogLookups();

  for (const row of payload.people) {
    let tradeId = isPositiveInteger(row.trade_id) ? Number(row.trade_id) : null;
    let levelId = isPositiveInteger(row.level_id) ? Number(row.level_id) : null;

    if (!tradeId && row.trade) {
      tradeId = tradeByName.get(String(row.trade).trim().toUpperCase()) || null;
      if (!tradeId) return `Invalid trade '${row.trade}' in person id ${row.id}.`;
    }

    if (!levelId && row.level) {
      levelId = levelByName.get(String(row.level).trim().toUpperCase()) || null;
      if (!levelId) return `Invalid level '${row.level}' in person id ${row.id}.`;
    }

    if (!tradeId || !levelId) {
      return `Invalid person row with id ${row.id}.`;
    }

    row.trade_id = tradeId;
    row.level_id = levelId;
    row.working_hours = isPositiveInteger(row.working_hours) ? Number(row.working_hours) : 40;
    row.status = normalizePeopleStatus(row.status);
  }

  return null;
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function payloadToCsv(payload) {
  const headers = [
    'entity', 'id', 'client_id', 'project_id', 'challenge_id', 'person_id', 'name', 'location', 'since_month', 'priority_id',
    'status', 'start_month', 'end_month', 'budget_cents', 'first_name', 'last_name', 'trade', 'level', 'is_hidden', 'is_leaver', 'person_status', 'working_hours', 'title', 'description',
    'is_owner', 'is_leader', 'quantity'
  ];

  const rows = [headers.join(',')];

  function pushRow(entity, row) {
    const values = headers.map((header) => {
      if (header === 'entity') return entity;
      if (entity === 'people' && header === 'person_status') return row.status;
      return row[header];
    });
    rows.push(values.map(csvEscape).join(','));
  }

  payload.clients.forEach((row) => pushRow('clients', row));
  payload.projects.forEach((row) => pushRow('projects', row));
  payload.people.forEach((row) => pushRow('people', row));
  payload.challenges.forEach((row) => pushRow('challenges', row));
  payload.assignments.forEach((row) => pushRow('assignments', row));

  return rows.join('\n');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error('CSV parse error: unclosed quote.');
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseCsvBoolean(value) {
  if (value === 'true' || value === 'TRUE' || value === '1') return true;
  if (value === 'false' || value === 'FALSE' || value === '0') return false;
  return null;
}

function parseCsvInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

function parseCsvNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function csvToPayload(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const headers = rows[0];
  const requiredHeaders = ['entity', 'id'];
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`CSV missing required header: ${header}`);
    }
  }

  const payload = {
    clients: [],
    projects: [],
    people: [],
    challenges: [],
    assignments: []
  };

  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i];
    if (line.every((cell) => !String(cell).trim())) {
      continue;
    }

    const record = {};
    for (let h = 0; h < headers.length; h += 1) {
      record[headers[h]] = line[h] ?? '';
    }

    const entity = (record.entity || '').trim();
    if (!payload[entity]) {
      throw new Error(`CSV contains unknown entity '${entity}' on row ${i + 1}.`);
    }

    if (entity === 'clients') {
      payload.clients.push({
        id: parseCsvInteger(record.id),
        name: record.name,
        location: record.location,
        since_month: record.since_month,
        priority_id: parseCsvInteger(record.priority_id)
      });
    } else if (entity === 'projects') {
      payload.projects.push({
        id: parseCsvInteger(record.id),
        client_id: parseCsvInteger(record.client_id),
        name: record.name,
        status: normalizeProjectStatus(record.status),
        start_month: record.start_month,
        end_month: record.end_month || null,
        budget_cents: parseCsvInteger(record.budget_cents)
      });
    } else if (entity === 'people') {
      payload.people.push({
        id: parseCsvInteger(record.id),
        first_name: record.first_name,
        last_name: record.last_name,
        trade: record.trade,
        level: record.level,
        trade_id: parseCsvInteger(record.trade_id),
        level_id: parseCsvInteger(record.level_id),
        is_hidden: parseCsvBoolean(record.is_hidden),
        is_leaver: parseCsvBoolean(record.is_leaver),
        status: normalizePeopleStatus(record.person_status || record.status),
        working_hours: parseCsvInteger(record.working_hours)
      });
    } else if (entity === 'challenges') {
      payload.challenges.push({
        id: parseCsvInteger(record.id),
        project_id: parseCsvInteger(record.project_id),
        title: record.title,
        description: record.description
      });
    } else if (entity === 'assignments') {
      payload.assignments.push({
        id: parseCsvInteger(record.id),
        project_id: parseCsvInteger(record.project_id),
        challenge_id: parseCsvInteger(record.challenge_id),
        person_id: parseCsvInteger(record.person_id),
        is_owner: parseCsvBoolean(record.is_owner),
        is_leader: parseCsvBoolean(record.is_leader),
        quantity: parseCsvNumber(record.quantity)
      });
    }
  }

  return payload;
}

function configurationPayloadToCsv(payload) {
  const rows = ['entity,id,name'];
  (payload.trades || []).forEach((row) => rows.push([csvEscape('trades'), csvEscape(row.id), csvEscape(row.name)].join(',')));
  (payload.levels || []).forEach((row) => rows.push([csvEscape('levels'), csvEscape(row.id), csvEscape(row.name)].join(',')));
  return rows.join('\n');
}

function csvToConfigurationPayload(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const headers = rows[0];
  if (!headers.includes('entity') || !headers.includes('name')) {
    throw new Error('CSV missing required headers: entity,name');
  }

  const payload = { trades: [], levels: [] };
  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i];
    if (line.every((cell) => !String(cell).trim())) continue;

    const record = {};
    for (let h = 0; h < headers.length; h += 1) {
      record[headers[h]] = line[h] ?? '';
    }

    const entity = String(record.entity || '').trim().toLowerCase();
    if (!['trades', 'levels'].includes(entity)) {
      throw new Error(`CSV contains unknown entity '${entity}' on row ${i + 1}.`);
    }

    payload[entity].push({ id: parseCsvInteger(record.id), name: String(record.name || '').trim() });
  }

  return payload;
}

function summarizeConfigurationPayload(payload) {
  return {
    trades: (payload.trades || []).length,
    levels: (payload.levels || []).length
  };
}

function summarizeImportPayload(payload) {
  return {
    clients: payload.clients.length,
    projects: payload.projects.length,
    people: payload.people.length,
    challenges: payload.challenges.length,
    assignments: payload.assignments.length
  };
}

app.post('/api/import/preview', requirePermission(PERMISSIONS.IMPORT_RUN), async (req, res) => {
  const format = String(req.body?.format || '').toLowerCase();

  try {
    let payload;
    if (format === 'json') {
      payload = req.body?.data;
      if (!payload) return badRequest(res, 'Import payload must contain a data object.');
    } else if (format === 'csv') {
      const content = req.body?.content;
      if (typeof content !== 'string') return badRequest(res, 'CSV preview requires a content string.');
      payload = csvToPayload(content);
    } else {
      return badRequest(res, 'Unsupported import format.');
    }

    for (const project of payload.projects) {
      project.status = normalizeProjectStatus(project.status);
    }

    const normalizationError = await normalizeImportPeople(payload);
    if (normalizationError) return badRequest(res, normalizationError);

    const validationError = validateImportPayload(payload);
    if (validationError) return badRequest(res, validationError);

    return res.json({
      ok: true,
      summary: summarizeImportPayload(payload),
      data: payload
    });
  } catch (error) {
    return badRequest(res, error.message || 'Invalid import payload.');
  }
});

app.post('/api/import/config/preview', requirePermission(PERMISSIONS.IMPORT_RUN), async (req, res) => {
  const format = String(req.body?.format || '').toLowerCase();

  try {
    let payload;
    if (format === 'json') {
      payload = req.body?.data;
      if (!payload) return badRequest(res, 'Import payload must contain a data object.');
    } else if (format === 'csv') {
      const content = req.body?.content;
      if (typeof content !== 'string') return badRequest(res, 'CSV preview requires a content string.');
      payload = csvToConfigurationPayload(content);
    } else {
      return badRequest(res, 'Unsupported import format.');
    }

    const trades = normalizeConfigurationItems(payload.trades, 'trades');
    const levels = normalizeConfigurationItems(payload.levels, 'levels');

    return res.json({
      ok: true,
      summary: summarizeConfigurationPayload({ trades, levels }),
      data: { trades, levels }
    });
  } catch (error) {
    return badRequest(res, error.message || 'Invalid import payload.');
  }
});

app.post('/api/import/config', requirePermission(PERMISSIONS.IMPORT_RUN), async (req, res) => {
  try {
    const summary = await applyConfigurationCatalog({
      trades: req.body?.data?.trades,
      levels: req.body?.data?.levels
    });
    return res.json({ ok: true, summary });
  } catch (error) {
    return badRequest(res, error.message || 'Invalid import payload.');
  }
});

app.post('/api/import', requirePermission(PERMISSIONS.IMPORT_RUN), async (req, res) => {
  const payload = req.body?.data;

  if (!payload) {
    return badRequest(res, 'Import payload must contain a data object.');
  }

  for (const project of payload.projects) {
    project.status = normalizeProjectStatus(project.status);
  }

  const normalizationError = await normalizeImportPeople(payload);
  if (normalizationError) {
    return badRequest(res, normalizationError);
  }

  const validationError = validateImportPayload(payload);
  if (validationError) {
    return badRequest(res, validationError);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM assignments');
    await client.query('DELETE FROM challenges');
    await client.query('DELETE FROM projects');
    await client.query('DELETE FROM people');
    await client.query('DELETE FROM clients');

    for (const row of payload.clients) {
      await client.query(
        'INSERT INTO clients (id, name, location, since_month, priority_id) VALUES ($1, $2, $3, $4, $5)',
        [row.id, row.name, row.location, row.since_month, row.priority_id]
      );
    }

    for (const row of payload.projects) {
      await client.query(
        'INSERT INTO projects (id, client_id, name, status, start_month, end_month, budget_cents) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [row.id, row.client_id, row.name, normalizeProjectStatus(row.status), row.start_month, row.end_month || null, row.budget_cents]
      );
    }

    for (const row of payload.people) {
      await client.query(
        'INSERT INTO people (id, first_name, last_name, trade_id, level_id, is_hidden, is_leaver, status, working_hours) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [row.id, row.first_name, row.last_name, row.trade_id, row.level_id, row.is_hidden ?? null, row.is_leaver ?? null, normalizePeopleStatus(row.status), row.working_hours ?? 40]
      );
    }

    for (const row of payload.challenges) {
      await client.query(
        'INSERT INTO challenges (id, project_id, title, description) VALUES ($1, $2, $3, $4)',
        [row.id, row.project_id, row.title, row.description]
      );
    }

    for (const row of payload.assignments) {
      await client.query(
        `INSERT INTO assignments (id, project_id, challenge_id, person_id, is_owner, is_leader, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.project_id, row.challenge_id, row.person_id, row.is_owner, row.is_leader, row.quantity]
      );
    }

    const sequenceTables = ['clients', 'projects', 'people', 'challenges', 'assignments'];
    for (const table of sequenceTables) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`
      );
    }

    await client.query('COMMIT');
    return res.json({ ok: true, summary: summarizeImportPayload(payload) });
  } catch (error) {
    await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    client.release();
  }
});


app.get(['/teams', '/teams/:id', '/people', '/people/:id', '/admin', '/admin/:tab'], (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ status: 'error', details: error.message });
  }
});

async function startServer() {
  try {
    await ensureProjectStatusColumn();
    await ensurePeopleFlagsColumns();
    await ensurePeopleStatusColumn();
    await ensurePeopleWorkingHoursColumn();
    await ensurePriorityCatalog();
    await ensurePeopleCatalog();
  } catch (error) {
    console.warn('Catalog initialization skipped at startup.', error.message);
  }

  app.listen(port, () => {
    console.log(`Projectory app listening on port ${port}`);
  });
}

module.exports = { app, startServer, pool };
