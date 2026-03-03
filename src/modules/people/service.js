const peopleRepo = require('./repo');
const { validatePersonPayload } = require('./schema');

function buildPersonInput(body, parseOptionalBoolean, parseWorkingHours) {
  const validation = validatePersonPayload(body, parseWorkingHours);
  if (validation.error) {
    return { error: validation.error };
  }

  const { firstName, lastName, tradeId, levelId, parsedWorkingHours, hasStatus, normalizedStatus } = validation.value;
  const { isHidden, isLeaver } = body;

  return {
    value: {
      firstName,
      lastName,
      tradeId,
      levelId,
      hasStatus,
      normalizedStatus,
      isHidden: parseOptionalBoolean(isHidden),
      isLeaver: parseOptionalBoolean(isLeaver),
      workingHours: parsedWorkingHours
    }
  };
}

async function getPeople(pool) {
  const result = await peopleRepo.listPeople(pool);
  return result.rows;
}

async function getPeopleByProjectIds(pool, projectIds) {
  const result = await peopleRepo.listPeopleByProjectIds(pool, projectIds);
  return result.rows;
}

async function createPerson(pool, body, parseOptionalBoolean, parseWorkingHours) {
  const parsed = buildPersonInput(body, parseOptionalBoolean, parseWorkingHours);
  if (parsed.error) {
    return { error: parsed.error };
  }

  const result = await peopleRepo.createPerson(pool, {
    ...parsed.value,
    status: parsed.value.hasStatus ? parsed.value.normalizedStatus : 'active'
  });
  return { value: { id: result.rows[0].id } };
}

async function updatePerson(pool, id, body, parseOptionalBoolean, parseWorkingHours) {
  const parsed = buildPersonInput(body, parseOptionalBoolean, parseWorkingHours);
  if (parsed.error) {
    return { error: parsed.error };
  }

  const result = await peopleRepo.updatePerson(pool, id, {
    ...parsed.value,
    status: parsed.value.hasStatus ? parsed.value.normalizedStatus : null
  });
  return { value: { rowCount: result.rowCount } };
}

async function removePerson(pool, id) {
  const result = await peopleRepo.deletePerson(pool, id);
  return { rowCount: result.rowCount };
}

module.exports = {
  getPeople,
  getPeopleByProjectIds,
  createPerson,
  updatePerson,
  removePerson
};
