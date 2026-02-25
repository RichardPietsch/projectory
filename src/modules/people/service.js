const peopleRepo = require('./repo');
const { validatePersonPayload } = require('./schema');

function buildPersonInput(body, parseOptionalBoolean, parseWorkingHours) {
  const validation = validatePersonPayload(body, parseWorkingHours);
  if (validation.error) {
    return { error: validation.error };
  }

  const { firstName, lastName, tradeId, levelId, parsedWorkingHours } = validation.value;
  const { isHidden, isLeaver } = body;

  return {
    value: {
      firstName,
      lastName,
      tradeId,
      levelId,
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

async function createPerson(pool, body, parseOptionalBoolean, parseWorkingHours) {
  const parsed = buildPersonInput(body, parseOptionalBoolean, parseWorkingHours);
  if (parsed.error) {
    return { error: parsed.error };
  }

  const result = await peopleRepo.createPerson(pool, parsed.value);
  return { value: { id: result.rows[0].id } };
}

async function updatePerson(pool, id, body, parseOptionalBoolean, parseWorkingHours) {
  const parsed = buildPersonInput(body, parseOptionalBoolean, parseWorkingHours);
  if (parsed.error) {
    return { error: parsed.error };
  }

  const result = await peopleRepo.updatePerson(pool, id, parsed.value);
  return { value: { rowCount: result.rowCount } };
}

async function removePerson(pool, id) {
  const result = await peopleRepo.deletePerson(pool, id);
  return { rowCount: result.rowCount };
}

module.exports = {
  getPeople,
  createPerson,
  updatePerson,
  removePerson
};
