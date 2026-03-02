const ONBOARDING_STATUS_VALUES = ['planned', 'in_progress', 'completed', 'paused', 'cancelled'];

function normalizeOnboardingStatus(status, fallback = 'planned') {
  const normalized = String(status || '').trim().toLowerCase();
  if (ONBOARDING_STATUS_VALUES.includes(normalized)) return normalized;
  return fallback;
}

function validateOnboardingProfilePayload(payload) {
  const { firstName, lastName, email, startDate, status, notes, personId } = payload || {};

  if (!firstName || !lastName) {
    return { error: 'firstName and lastName are required.' };
  }

  if (startDate && Number.isNaN(Date.parse(startDate))) {
    return { error: 'startDate must be a valid date string.' };
  }

  if (status !== undefined && status !== null && !ONBOARDING_STATUS_VALUES.includes(String(status).trim().toLowerCase())) {
    return { error: `status must be one of: ${ONBOARDING_STATUS_VALUES.join(', ')}.` };
  }

  return {
    value: {
      personId: personId || null,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: email ? String(email).trim() : null,
      startDate: startDate || null,
      status: normalizeOnboardingStatus(status),
      notes: notes ? String(notes) : null
    }
  };
}

function validateOnboardingStepPayload(payload) {
  const { stepKey, label, isDone, sortOrder } = payload || {};
  if (!stepKey || !label) {
    return { error: 'stepKey and label are required.' };
  }

  return {
    value: {
      stepKey: String(stepKey).trim(),
      label: String(label).trim(),
      isDone: Boolean(isDone),
      sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0
    }
  };
}

module.exports = {
  ONBOARDING_STATUS_VALUES,
  normalizeOnboardingStatus,
  validateOnboardingProfilePayload,
  validateOnboardingStepPayload
};
