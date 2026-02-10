const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'helloapp',
  user: process.env.DB_USER || 'hello',
  password: process.env.DB_PASSWORD || 'hello'
});

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

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

async function rebalancePersonAssignments(personId, client = pool) {
  const projectRows = await client.query(
    `SELECT DISTINCT project_id
     FROM assignments
     WHERE person_id = $1
     ORDER BY project_id`,
    [personId]
  );

  const projectIds = projectRows.rows.map((row) => row.project_id);
  const count = projectIds.length;

  if (count === 0) {
    return;
  }

  const baseBps = Math.floor(10000 / count);
  let remaining = 10000;

  for (let i = 0; i < projectIds.length; i += 1) {
    const bps = i === projectIds.length - 1 ? remaining : baseBps;
    remaining -= bps;
    const quantity = (bps / 100).toFixed(2);

    await client.query(
      `UPDATE assignments
       SET quantity = $1
       WHERE person_id = $2 AND project_id = $3`,
      [quantity, personId, projectIds[i]]
    );
  }
}

app.get('/api/meta', async (_req, res) => {
  try {
    const [priorities, trades, levels] = await Promise.all([
      pool.query('SELECT id, name FROM priorities ORDER BY id'),
      pool.query('SELECT id, name FROM trades ORDER BY id'),
      pool.query('SELECT id, name FROM levels ORDER BY id')
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

app.get('/api/people', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.first_name, p.last_name,
              t.id AS trade_id, t.name AS trade_name,
              l.id AS level_id, l.name AS level_name,
              COALESCE(COUNT(a.id), 0) AS assignment_count,
              COALESCE(SUM(a.quantity), 0) AS assignment_quantity_total
       FROM people p
       JOIN trades t ON p.trade_id = t.id
       JOIN levels l ON p.level_id = l.id
       LEFT JOIN assignments a ON a.person_id = p.id
       GROUP BY p.id, t.id, l.id
       ORDER BY p.last_name, p.first_name`
    );

    res.json(result.rows);
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post('/api/people', async (req, res) => {
  const { firstName, lastName, tradeId, levelId } = req.body;

  if (!firstName || !lastName || !tradeId || !levelId) {
    return badRequest(res, 'firstName, lastName, tradeId and levelId are required.');
  }

  try {
    const result = await pool.query(
      `INSERT INTO people (first_name, last_name, trade_id, level_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [firstName.trim(), lastName.trim(), tradeId, levelId]
    );

    return res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.put('/api/people/:id', async (req, res) => {
  const { firstName, lastName, tradeId, levelId } = req.body;

  if (!firstName || !lastName || !tradeId || !levelId) {
    return badRequest(res, 'firstName, lastName, tradeId and levelId are required.');
  }

  try {
    const result = await pool.query(
      `UPDATE people
       SET first_name = $1, last_name = $2, trade_id = $3, level_id = $4
       WHERE id = $5`,
      [firstName.trim(), lastName.trim(), tradeId, levelId, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Person not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.delete('/api/people/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM people WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Person not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.get('/api/clients', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.location, c.since_month,
              p.id AS priority_id, p.name AS priority_name,
              COALESCE(COUNT(pr.id), 0) AS project_count
       FROM clients c
       JOIN priorities p ON c.priority_id = p.id
       LEFT JOIN projects pr ON pr.client_id = c.id
       GROUP BY c.id, p.id
       ORDER BY c.name`
    );

    res.json(result.rows);
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post('/api/clients', async (req, res) => {
  const { name, location, sinceMonth, priorityId } = req.body;
  const monthError = requireMonth(sinceMonth, 'sinceMonth');

  if (!name || !location || !priorityId || monthError) {
    return badRequest(res, monthError || 'name, location, sinceMonth and priorityId are required.');
  }

  try {
    const result = await pool.query(
      `INSERT INTO clients (name, location, since_month, priority_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [name.trim(), location.trim(), sinceMonth, priorityId]
    );

    return res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.put('/api/clients/:id', async (req, res) => {
  const { name, location, sinceMonth, priorityId } = req.body;
  const monthError = requireMonth(sinceMonth, 'sinceMonth');

  if (!name || !location || !priorityId || monthError) {
    return badRequest(res, monthError || 'name, location, sinceMonth and priorityId are required.');
  }

  try {
    const result = await pool.query(
      `UPDATE clients
       SET name = $1, location = $2, since_month = $3, priority_id = $4
       WHERE id = $5`,
      [name.trim(), location.trim(), sinceMonth, priorityId, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Client not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.get('/api/projects', async (_req, res) => {
  try {
    const projects = await pool.query(
      `SELECT p.id, p.name, p.start_month, p.end_month, p.budget_cents,
              c.id AS client_id, c.name AS client_name
       FROM projects p
       JOIN clients c ON p.client_id = c.id
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
              pe.first_name, pe.last_name, ch.title AS challenge_title
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

app.post('/api/projects', async (req, res) => {
  const { clientId, name, startMonth, endMonth, budgetEuros, budgetCents } = req.body;

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
      `INSERT INTO projects (client_id, name, start_month, end_month, budget_cents)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [clientId, name.trim(), startMonth, endMonth || null, normalizedBudgetCents]
    );

    return res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.put('/api/projects/:id', async (req, res) => {
  const { clientId, name, startMonth, endMonth, budgetEuros, budgetCents } = req.body;

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
       SET client_id = $1, name = $2, start_month = $3, end_month = $4, budget_cents = $5
       WHERE id = $6`,
      [clientId, name.trim(), startMonth, endMonth || null, normalizedBudgetCents, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.delete('/api/projects/:id', async (req, res) => {
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

app.post('/api/projects/:projectId/challenges', async (req, res) => {
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

app.put('/api/challenges/:id', async (req, res) => {
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

app.delete('/api/challenges/:id', async (req, res) => {
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

app.post('/api/assignments', async (req, res) => {
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

    const inserted = await client.query(
      `INSERT INTO assignments (project_id, challenge_id, person_id, is_owner, is_leader)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [projectId, challengeId, personId, Boolean(isOwner), Boolean(isLeader)]
    );

    await rebalancePersonAssignments(personId, client);

    await client.query('COMMIT');
    return res.status(201).json({ id: inserted.rows[0].id });
  } catch (error) {
    await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    client.release();
  }
});

app.put('/api/assignments/:id', async (req, res) => {
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

app.delete('/api/assignments/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const assignment = await client.query('SELECT person_id FROM assignments WHERE id = $1', [req.params.id]);
    if (assignment.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found.' });
    }

    await client.query('DELETE FROM assignments WHERE id = $1', [req.params.id]);
    await rebalancePersonAssignments(assignment.rows[0].person_id, client);

    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    client.release();
  }
});


app.get('/api/export', async (_req, res) => {
  try {
    const [clients, projects, people, challenges, assignments] = await Promise.all([
      pool.query('SELECT id, name, location, since_month, priority_id FROM clients ORDER BY id'),
      pool.query('SELECT id, client_id, name, start_month, end_month, budget_cents FROM projects ORDER BY id'),
      pool.query('SELECT id, first_name, last_name, trade_id, level_id FROM people ORDER BY id'),
      pool.query('SELECT id, project_id, title, description FROM challenges ORDER BY id'),
      pool.query('SELECT id, project_id, challenge_id, person_id, is_owner, is_leader, quantity FROM assignments ORDER BY id')
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      version: 1,
      data: {
        clients: clients.rows,
        projects: projects.rows,
        people: people.rows,
        challenges: challenges.rows,
        assignments: assignments.rows
      }
    });
  } catch (error) {
    handleDbError(res, error);
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

    if (row.end_month && !MONTH_REGEX.test(row.end_month)) {
      return `Invalid end_month in project id ${row.id}.`;
    }
  }

  for (const row of payload.people) {
    if (!isPositiveInteger(row.id) || !row.first_name || !row.last_name || !isPositiveInteger(row.trade_id) || !isPositiveInteger(row.level_id)) {
      return `Invalid person row with id ${row.id}.`;
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

app.post('/api/import', async (req, res) => {
  const payload = req.body?.data;

  if (!payload) {
    return badRequest(res, 'Import payload must contain a data object.');
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
        'INSERT INTO projects (id, client_id, name, start_month, end_month, budget_cents) VALUES ($1, $2, $3, $4, $5, $6)',
        [row.id, row.client_id, row.name, row.start_month, row.end_month || null, row.budget_cents]
      );
    }

    for (const row of payload.people) {
      await client.query(
        'INSERT INTO people (id, first_name, last_name, trade_id, level_id) VALUES ($1, $2, $3, $4, $5)',
        [row.id, row.first_name, row.last_name, row.trade_id, row.level_id]
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
    return res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    client.release();
  }
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ status: 'error', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Projectory app listening on port ${port}`);
});
