const projectsRepo = require('./repo');

function normalizeBudgetCents({ budgetEuros, budgetCents }) {
  const normalized = budgetEuros !== undefined
    ? Math.round(Number(budgetEuros) * 100)
    : Number(budgetCents);

  if (!Number.isFinite(normalized) || normalized < 0) {
    return null;
  }

  return normalized;
}

function validateProjectPayload(body, requireMonth) {
  const { clientId, name, startMonth, endMonth, budgetEuros, budgetCents } = body;

  if (!clientId || !name || !startMonth || (budgetEuros === undefined && budgetCents === undefined)) {
    return { error: 'clientId, name, startMonth and budgetEuros are required.' };
  }

  const startError = requireMonth(startMonth, 'startMonth');
  if (startError) {
    return { error: startError };
  }

  if (endMonth && requireMonth(endMonth, 'endMonth')) {
    return { error: 'endMonth must be in yyyy-mm format.' };
  }

  const normalizedBudgetCents = normalizeBudgetCents({ budgetEuros, budgetCents });
  if (normalizedBudgetCents === null) {
    return { error: 'budgetEuros must be a positive number.' };
  }

  return {
    value: {
      clientId,
      name: String(name).trim(),
      startMonth,
      endMonth: endMonth || null,
      budgetCents: normalizedBudgetCents
    }
  };
}

async function getProjectsSnapshot(pool) {
  const [projects, challenges, assignments] = await Promise.all([
    projectsRepo.listProjects(pool),
    projectsRepo.listChallenges(pool),
    projectsRepo.listAssignments(pool)
  ]);

  return {
    projects: projects.rows,
    challenges: challenges.rows,
    assignments: assignments.rows
  };
}

function filterScopedSnapshot(snapshot, scopedProjectIds) {
  const scopedIds = new Set((scopedProjectIds || []).map((id) => Number(id)));
  return {
    projects: snapshot.projects.filter((project) => scopedIds.has(Number(project.id))),
    challenges: snapshot.challenges.filter((challenge) => scopedIds.has(Number(challenge.project_id))),
    assignments: snapshot.assignments.filter((assignment) => scopedIds.has(Number(assignment.project_id)))
  };
}

async function createProject(pool, payload, { requireMonth, normalizeProjectStatus }) {
  const parsed = validateProjectPayload(payload, requireMonth);
  if (parsed.error) return { error: parsed.error };

  const result = await projectsRepo.insertProject(pool, {
    clientId: parsed.value.clientId,
    name: parsed.value.name,
    status: normalizeProjectStatus(payload.status),
    startMonth: parsed.value.startMonth,
    endMonth: parsed.value.endMonth,
    budgetCents: parsed.value.budgetCents
  });

  return { value: { id: result.rows[0].id } };
}

async function updateProject(pool, id, payload, { requireMonth, normalizeProjectStatus }) {
  const parsed = validateProjectPayload(payload, requireMonth);
  if (parsed.error) return { error: parsed.error };

  const result = await projectsRepo.updateProject(pool, id, {
    clientId: parsed.value.clientId,
    name: parsed.value.name,
    status: normalizeProjectStatus(payload.status),
    startMonth: parsed.value.startMonth,
    endMonth: parsed.value.endMonth,
    budgetCents: parsed.value.budgetCents
  });

  return { value: { rowCount: result.rowCount } };
}

async function createChallenge(pool, payload) {
  const { projectId, title, description } = payload;
  if (!projectId || !title || !String(title).trim()) {
    return { error: 'projectId and title are required.' };
  }

  const result = await projectsRepo.insertChallenge(pool, {
    projectId,
    title: String(title).trim(),
    description: String(description || '').trim() || null
  });
  return { value: { id: result.rows[0].id } };
}

async function updateChallenge(pool, id, payload) {
  const { title, description } = payload;
  if (!title || !String(title).trim()) {
    return { error: 'title is required.' };
  }

  const result = await projectsRepo.updateChallenge(pool, id, {
    title: String(title).trim(),
    description: String(description || '').trim() || null
  });

  return { value: { rowCount: result.rowCount } };
}

async function createAssignment(pool, payload, helpers) {
  const { projectId, challengeId, personId, isOwner, isLeader } = payload;
  if (!projectId || !challengeId || !personId) {
    return { error: 'projectId, challengeId and personId are required.' };
  }
  if (isOwner && isLeader) {
    return { error: 'Assignment cannot be both owner and leader.' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const challengeResult = await projectsRepo.findChallengeInProject(client, challengeId, projectId);
    if (challengeResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { error: 'Challenge must belong to the selected project.' };
    }

    const existing = await projectsRepo.findDuplicateAssignment(client, challengeId, personId);
    if (existing.rowCount > 0) {
      await projectsRepo.updateAssignmentFlags(client, existing.rows[0].id, { isOwner, isLeader });
      await client.query('COMMIT');
      return { value: { id: existing.rows[0].id, deduplicated: true } };
    }

    const currentProjectTotal = await helpers.getPersonProjectTotalQuantity(personId, projectId, client);
    const inserted = await projectsRepo.insertAssignment(client, { projectId, challengeId, personId, isOwner, isLeader });

    const targetProjectTotal = currentProjectTotal > 0 ? currentProjectTotal : 100;
    await helpers.distributeProjectQuantityAcrossAssignments(personId, projectId, targetProjectTotal, client);

    await client.query('COMMIT');
    return { value: { id: inserted.rows[0].id, deduplicated: false } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateAssignment(pool, id, payload) {
  const { isOwner, isLeader } = payload;
  if (isOwner && isLeader) {
    return { error: 'Assignment cannot be both owner and leader.' };
  }

  const result = await projectsRepo.updateAssignmentFlags(pool, id, { isOwner, isLeader });
  return { value: { rowCount: result.rowCount } };
}

async function updatePersonProjectQuantity(pool, projectId, personId, quantity, helpers) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const assignments = await projectsRepo.listAssignmentsByProjectPerson(client, projectId, personId);
    if (assignments.rowCount === 0) {
      await client.query('ROLLBACK');
      return { error: 'No assignments found for this person in the selected project.', notFound: true };
    }

    await helpers.distributeProjectQuantityAcrossAssignments(personId, projectId, quantity, client);

    await client.query('COMMIT');
    return { value: { updated: assignments.rowCount, projectQuantity: quantity } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteAssignment(pool, id, helpers) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const assignment = await projectsRepo.findAssignmentBasics(client, id);

    if (assignment.rowCount === 0) {
      await client.query('ROLLBACK');
      return { notFound: true };
    }

    const personId = assignment.rows[0].person_id;
    const projectId = assignment.rows[0].project_id;
    const projectTotalBeforeDelete = await helpers.getPersonProjectTotalQuantity(personId, projectId, client);

    await projectsRepo.deleteAssignment(client, id);
    await helpers.distributeProjectQuantityAcrossAssignments(personId, projectId, projectTotalBeforeDelete, client);

    await client.query('COMMIT');
    return { value: { projectId } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getProjectsSnapshot,
  filterScopedSnapshot,
  createProject,
  updateProject,
  createChallenge,
  updateChallenge,
  createAssignment,
  updateAssignment,
  updatePersonProjectQuantity,
  deleteAssignment
};
