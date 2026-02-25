function validatePersonPayload(payload, parseWorkingHours) {
  const { firstName, lastName, tradeId, levelId, workingHours } = payload || {};
  const parsedWorkingHours = parseWorkingHours(workingHours);

  if (!firstName || !lastName || !tradeId || !levelId) {
    return { error: 'firstName, lastName, tradeId and levelId are required.' };
  }

  if (parsedWorkingHours === null) {
    return { error: 'workingHours must be a positive integer.' };
  }

  return {
    value: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      tradeId,
      levelId,
      parsedWorkingHours
    }
  };
}

module.exports = {
  validatePersonPayload
};
