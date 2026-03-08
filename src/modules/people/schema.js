const PEOPLE_STATUS_VALUES = ['active', 'paused', 'leaver'];

function normalizePersonStatus(status, fallback = 'active') {
  const normalized = String(status || '').trim().toLowerCase();
  if (PEOPLE_STATUS_VALUES.includes(normalized)) return normalized;
  return fallback;
}

function validatePersonPayload(payload, parseWorkingHours) {
  const { firstName, lastName, tradeId, levelId, workingHours, status } = payload || {};
  const parsedWorkingHours = parseWorkingHours(workingHours);

  if (!firstName || !lastName || !tradeId || !levelId) {
    return { error: 'firstName, lastName, tradeId and levelId are required.' };
  }

  if (parsedWorkingHours === null) {
    return { error: 'workingHours must be a positive integer.' };
  }

  if (status !== undefined && status !== null && !PEOPLE_STATUS_VALUES.includes(String(status).trim().toLowerCase())) {
    return { error: `status must be one of: ${PEOPLE_STATUS_VALUES.join(', ')}.` };
  }

  return {
    value: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      tradeId,
      levelId,
      parsedWorkingHours,
      hasStatus: status !== undefined && status !== null,
      normalizedStatus: status !== undefined && status !== null ? normalizePersonStatus(status) : null
    }
  };
}

module.exports = {
  PEOPLE_STATUS_VALUES,
  normalizePersonStatus,
  validatePersonPayload
};
