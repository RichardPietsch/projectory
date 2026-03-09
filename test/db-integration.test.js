const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const shouldRun = process.env.RUN_DB_INTEGRATION === '1';

function buildSuffix() {
  return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function assertPgErrorCode(error, expectedCode, message) {
  assert.equal(error && error.code, expectedCode, `${message} (expected PG code ${expectedCode}, got ${error?.code || 'unknown'})`);
}

(shouldRun ? test : test.skip)('db integration: migration invariants for core schema and auth lifecycle', async () => {
  const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'helloapp',
    user: process.env.DB_USER || 'projectory_local_user',
    password: process.env.DB_PASSWORD || 'projectory_local_password'
  });

  const suffix = buildSuffix();

  try {
    // Invariant 1: schema_migrations registry exists.
    const schemaMigrations = await pool.query("SELECT to_regclass('public.schema_migrations') AS table_name");
    assert.equal(schemaMigrations.rows[0].table_name, 'schema_migrations', 'Invariant 1 failed: schema_migrations table must exist.');

    // Invariant 2: auth_sessions table exists and is reachable.
    const authSessions = await pool.query("SELECT to_regclass('public.auth_sessions') AS table_name");
    assert.equal(authSessions.rows[0].table_name, 'auth_sessions', 'Invariant 2 failed: auth_sessions table must exist.');

    // Invariant 3: assignment unique constraint exists.
    const assignmentUniqueConstraint = await pool.query(
      `SELECT 1
       FROM pg_constraint
       WHERE conname = 'assignment_unique_challenge_person'
       LIMIT 1`
    );
    assert.equal(assignmentUniqueConstraint.rowCount, 1, 'Invariant 3 failed: assignment_unique_challenge_person constraint must exist.');

    // Invariant 4: owner/leader mutual exclusion check exists.
    const ownerLeaderConstraint = await pool.query(
      `SELECT 1
       FROM pg_constraint
       WHERE conname = 'owner_leader_not_both'
       LIMIT 1`
    );
    assert.equal(ownerLeaderConstraint.rowCount, 1, 'Invariant 4 failed: owner_leader_not_both check constraint must exist.');

    // Invariant 5: critical indexes for auth lookups exist.
    const authSessionExpiryIndex = await pool.query(
      `SELECT 1
       FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'idx_auth_sessions_expires_at'
       LIMIT 1`
    );
    assert.equal(authSessionExpiryIndex.rowCount, 1, 'Invariant 5 failed: idx_auth_sessions_expires_at index must exist.');

    // Invariant 6: audit log timestamp index exists.
    const auditCreatedAtIndex = await pool.query(
      `SELECT 1
       FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'idx_audit_log_created_at'
       LIMIT 1`
    );
    assert.equal(auditCreatedAtIndex.rowCount, 1, 'Invariant 6 failed: idx_audit_log_created_at index must exist.');

    // Invariant 7: smtp_settings single-row identity check is present.
    const smtpIdCheckConstraint = await pool.query(
      `SELECT 1
       FROM pg_constraint
       WHERE conname = 'smtp_settings_id_check'
       LIMIT 1`
    );
    assert.equal(smtpIdCheckConstraint.rowCount, 1, 'Invariant 7 failed: smtp_settings id=1 CHECK constraint must exist.');

    // Create deterministic fixture graph once for FK/constraint lifecycle checks.
    const priorityId = Number((await pool.query("SELECT id FROM priorities ORDER BY id LIMIT 1")).rows[0].id);
    const tradeId = Number((await pool.query("SELECT id FROM trades ORDER BY id LIMIT 1")).rows[0].id);
    const levelId = Number((await pool.query("SELECT id FROM levels ORDER BY id LIMIT 1")).rows[0].id);

    const createdClient = await pool.query(
      `INSERT INTO clients (name, location, since_month, priority_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [`Client ${suffix}`, 'Berlin', '2024-01', priorityId]
    );
    const clientId = Number(createdClient.rows[0].id);

    const createdProject = await pool.query(
      `INSERT INTO projects (client_id, name, start_month, end_month, budget_cents, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [clientId, `Project ${suffix}`, '2024-01', '2024-12', 100000, 'green']
    );
    const projectId = Number(createdProject.rows[0].id);

    const createdPerson = await pool.query(
      `INSERT INTO people (first_name, last_name, trade_id, level_id, status, working_hours)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Test', `Person_${suffix}`, tradeId, levelId, 'active', 40]
    );
    const personId = Number(createdPerson.rows[0].id);

    const createdChallenge = await pool.query(
      `INSERT INTO challenges (project_id, title, description)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [projectId, `Challenge ${suffix}`, 'Constraint validation fixture']
    );
    const challengeId = Number(createdChallenge.rows[0].id);

    const createdAssignment = await pool.query(
      `INSERT INTO assignments (project_id, challenge_id, person_id, quantity)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [projectId, challengeId, personId, '50.00']
    );
    const assignmentId = Number(createdAssignment.rows[0].id);

    // Invariant 8: duplicate challenge/person assignment is blocked by uniqueness.
    await assert.rejects(
      () => pool.query(
        `INSERT INTO assignments (project_id, challenge_id, person_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [projectId, challengeId, personId, '20.00']
      ),
      (error) => {
        assertPgErrorCode(error, '23505', 'Invariant 8 failed: duplicate assignment must violate unique constraint.');
        return true;
      }
    );

    // Invariant 9: owner and leader cannot both be true.
    await assert.rejects(
      () => pool.query(
        `INSERT INTO assignments (project_id, challenge_id, person_id, quantity, is_owner, is_leader)
         VALUES ($1, $2, $3, $4, TRUE, TRUE)`,
        [projectId, challengeId, personId + 999999, '10.00']
      ),
      (error) => {
        assertPgErrorCode(error, '23503', 'Invariant 9 pre-check failed: invalid person id should fail FK before check constraint.');
        return true;
      }
    );

    const createdPersonTwo = await pool.query(
      `INSERT INTO people (first_name, last_name, trade_id, level_id, status, working_hours)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Test', `PersonTwo_${suffix}`, tradeId, levelId, 'active', 40]
    );
    const personTwoId = Number(createdPersonTwo.rows[0].id);

    await assert.rejects(
      () => pool.query(
        `INSERT INTO assignments (project_id, challenge_id, person_id, quantity, is_owner, is_leader)
         VALUES ($1, $2, $3, $4, TRUE, TRUE)`,
        [projectId, challengeId, personTwoId, '10.00']
      ),
      (error) => {
        assertPgErrorCode(error, '23514', 'Invariant 9 failed: owner_leader_not_both check must reject dual true flags.');
        return true;
      }
    );

    // Invariant 10: FK integrity blocks deleting referenced client/project.
    await assert.rejects(
      () => pool.query('DELETE FROM clients WHERE id = $1', [clientId]),
      (error) => {
        assertPgErrorCode(error, '23503', 'Invariant 10 failed: deleting referenced client must violate FK constraints.');
        return true;
      }
    );

    await assert.rejects(
      () => pool.query('DELETE FROM projects WHERE id = $1', [projectId]),
      (error) => {
        assertPgErrorCode(error, '23503', 'Invariant 10 failed: deleting referenced project must violate FK constraints.');
        return true;
      }
    );

    // Invariant 11: auth session lifecycle - deleting user cascades sessions and invites.
    const userResult = await pool.query(
      `INSERT INTO users (email, display_name, is_active)
       VALUES ($1, $2, TRUE)
       RETURNING id`,
      [`dbint_${suffix}@example.com`, `User ${suffix}`]
    );
    const userId = Number(userResult.rows[0].id);

    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, expires_at, ip_address, user_agent)
       VALUES ($1, $2, NOW() + INTERVAL '1 day', $3, $4)`,
      [`sess_${suffix}`, userId, '127.0.0.1', 'db-integration-test']
    );

    await pool.query(
      `INSERT INTO user_invites (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
      [userId, `invite_hash_${suffix}`]
    );

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    const remainingSessions = await pool.query('SELECT 1 FROM auth_sessions WHERE user_id = $1 LIMIT 1', [userId]);
    assert.equal(remainingSessions.rowCount, 0, 'Invariant 11 failed: deleting user must cascade auth_sessions rows.');

    const remainingInvites = await pool.query('SELECT 1 FROM user_invites WHERE user_id = $1 LIMIT 1', [userId]);
    assert.equal(remainingInvites.rowCount, 0, 'Invariant 11 failed: deleting user must cascade user_invites rows.');

    // Invariant 12: user_project_access composite PK prevents duplicates.
    const userAccessUser = await pool.query(
      `INSERT INTO users (email, display_name, is_active)
       VALUES ($1, $2, TRUE)
       RETURNING id`,
      [`access_${suffix}@example.com`, `Access User ${suffix}`]
    );
    const accessUserId = Number(userAccessUser.rows[0].id);

    await pool.query(
      `INSERT INTO user_project_access (user_id, project_id)
       VALUES ($1, $2)`,
      [accessUserId, projectId]
    );

    await assert.rejects(
      () => pool.query(
        `INSERT INTO user_project_access (user_id, project_id)
         VALUES ($1, $2)`,
        [accessUserId, projectId]
      ),
      (error) => {
        assertPgErrorCode(error, '23505', 'Invariant 12 failed: duplicate user_project_access rows must violate composite PK.');
        return true;
      }
    );

    // Clean up fixture graph in dependency-safe order.
    await pool.query('DELETE FROM user_project_access WHERE user_id = $1', [accessUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [accessUserId]);
    await pool.query('DELETE FROM assignments WHERE id = $1', [assignmentId]);
    await pool.query('DELETE FROM challenges WHERE id = $1', [challengeId]);
    await pool.query('DELETE FROM people WHERE id = ANY($1::int[])', [[personId, personTwoId]]);
    await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  } finally {
    await pool.end();
  }
});
