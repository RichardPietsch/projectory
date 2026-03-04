function buildPersonPayload(overrides = {}) {
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    tradeId: 1,
    levelId: 2,
    workingHours: 40,
    ...overrides
  };
}

function buildClientPayload(overrides = {}) {
  return {
    name: 'Acme',
    location: 'Berlin',
    sinceMonth: '2025-01',
    priorityId: 1,
    ...overrides
  };
}

function buildOnboardingProfilePayload(overrides = {}) {
  return {
    firstName: 'New',
    lastName: 'Hire',
    email: 'new.hire@example.com',
    status: 'planned',
    ...overrides
  };
}

module.exports = {
  buildPersonPayload,
  buildClientPayload,
  buildOnboardingProfilePayload
};
