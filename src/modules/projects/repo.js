async function listProjects(pool) {
  return pool.query(
    `SELECT p.id, p.name, p.status, p.start_month, p.end_month, p.budget_cents,
            c.id AS client_id, c.name AS client_name,
            pr.id AS priority_id, pr.name AS priority_name
     FROM projects p
     JOIN clients c ON p.client_id = c.id
     JOIN priorities pr ON c.priority_id = pr.id
     ORDER BY p.created_at DESC`
  );
}

async function listChallenges(pool) {
  return pool.query(
    `SELECT ch.id, ch.project_id, ch.title, ch.description,
            COALESCE(COUNT(a.id), 0) AS assignment_count,
            COALESCE(SUM(a.quantity), 0) AS assignment_quantity_total
     FROM challenges ch
     LEFT JOIN assignments a ON a.challenge_id = ch.id
     GROUP BY ch.id
     ORDER BY ch.created_at DESC`
  );
}

async function listAssignments(pool) {
  return pool.query(
    `SELECT a.id, a.project_id, a.challenge_id, a.person_id,
            a.is_owner, a.is_leader, a.quantity,
            pe.first_name, pe.last_name, COALESCE(pe.is_leaver, FALSE) AS is_leaver, pe.working_hours, ch.title AS challenge_title
     FROM assignments a
     JOIN people pe ON pe.id = a.person_id
     JOIN challenges ch ON ch.id = a.challenge_id
     ORDER BY a.created_at DESC`
  );
}

async function insertProject(poolOrClient, { clientId, name, status, startMonth, endMonth, budgetCents }) {
  return poolOrClient.query(
    `INSERT INTO projects (client_id, name, status, start_month, end_month, budget_cents)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [clientId, name, status, startMonth, endMonth, budgetCents]
  );
}

async function updateProject(poolOrClient, id, { clientId, name, status, startMonth, endMonth, budgetCents }) {
  return poolOrClient.query(
    `UPDATE projects
     SET client_id = $1, name = $2, status = $3, start_month = $4, end_month = $5, budget_cents = $6
     WHERE id = $7`,
    [clientId, name, status, startMonth, endMonth, budgetCents, id]
  );
}

async function deleteProject(poolOrClient, id) {
  return poolOrClient.query('DELETE FROM projects WHERE id = $1', [id]);
}

async function insertChallenge(poolOrClient, { projectId, title, description }) {
  return poolOrClient.query(
    `INSERT INTO challenges (project_id, title, description)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [projectId, title, description]
  );
}

async function updateChallenge(poolOrClient, id, { title, description }) {
  return poolOrClient.query(
    `UPDATE challenges
     SET title = $1, description = $2
     WHERE id = $3`,
    [title, description, id]
  );
}

async function deleteChallenge(poolOrClient, id) {
  return poolOrClient.query('DELETE FROM challenges WHERE id = $1', [id]);
}

async function findChallengeInProject(poolOrClient, challengeId, projectId) {
  return poolOrClient.query(
    'SELECT id FROM challenges WHERE id = $1 AND project_id = $2',
    [challengeId, projectId]
  );
}

async function findDuplicateAssignment(poolOrClient, challengeId, personId) {
  return poolOrClient.query(
    `SELECT id
     FROM assignments
     WHERE challenge_id = $1 AND person_id = $2
     LIMIT 1`,
    [challengeId, personId]
  );
}

async function updateAssignmentFlags(poolOrClient, id, { isOwner, isLeader }) {
  return poolOrClient.query(
    `UPDATE assignments
     SET is_owner = $1, is_leader = $2
     WHERE id = $3`,
    [Boolean(isOwner), Boolean(isLeader), id]
  );
}

async function insertAssignment(poolOrClient, { projectId, challengeId, personId, isOwner, isLeader }) {
  return poolOrClient.query(
    `INSERT INTO assignments (project_id, challenge_id, person_id, is_owner, is_leader)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [projectId, challengeId, personId, Boolean(isOwner), Boolean(isLeader)]
  );
}

async function deleteAssignment(poolOrClient, id) {
  return poolOrClient.query('DELETE FROM assignments WHERE id = $1', [id]);
}

async function listAssignmentsByProjectPerson(poolOrClient, projectId, personId) {
  return poolOrClient.query(
    `SELECT id
     FROM assignments
     WHERE project_id = $1 AND person_id = $2`,
    [projectId, personId]
  );
}

async function findAssignmentBasics(poolOrClient, id) {
  return poolOrClient.query('SELECT person_id, project_id FROM assignments WHERE id = $1', [id]);
}

module.exports = {
  listProjects,
  listChallenges,
  listAssignments,
  insertProject,
  updateProject,
  deleteProject,
  insertChallenge,
  updateChallenge,
  deleteChallenge,
  findChallengeInProject,
  findDuplicateAssignment,
  updateAssignmentFlags,
  insertAssignment,
  deleteAssignment,
  listAssignmentsByProjectPerson,
  findAssignmentBasics
};
