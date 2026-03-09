const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PEOPLE_OVERVIEW_STEP_ID,
  normalizeRole,
  roleCanSeePeopleOverview,
  filterOnboardingStepsByRole,
  clampOnboardingStepIndex,
  getOnboardingStepUiState
} = require('../public/js/onboarding-tour.js');

const BASE_STEPS = [
  { id: 'welcome' },
  { id: 'project-overview' },
  { id: PEOPLE_OVERVIEW_STEP_ID },
  { id: 'wrap-up' }
];

test('normalizeRole lowercases and defaults to viewer for empty input', () => {
  assert.equal(normalizeRole('  ADMIN  '), 'admin');
  assert.equal(normalizeRole(''), 'viewer');
  assert.equal(normalizeRole(null), 'viewer');
});

test('roleCanSeePeopleOverview matches role expectations', () => {
  assert.equal(roleCanSeePeopleOverview('admin'), true);
  assert.equal(roleCanSeePeopleOverview('planner'), true);
  assert.equal(roleCanSeePeopleOverview('viewer'), true);
  assert.equal(roleCanSeePeopleOverview('teammate'), false);
});

test('filterOnboardingStepsByRole keeps People Overview for admin/planner/viewer', () => {
  const roles = ['admin', 'planner', 'viewer'];
  for (const role of roles) {
    const filtered = filterOnboardingStepsByRole(BASE_STEPS, role);
    assert.equal(filtered.some((step) => step.id === PEOPLE_OVERVIEW_STEP_ID), true);
    assert.equal(filtered.length, BASE_STEPS.length);
  }
});

test('filterOnboardingStepsByRole removes People Overview step for teammate', () => {
  const filtered = filterOnboardingStepsByRole(BASE_STEPS, 'teammate');
  assert.equal(filtered.some((step) => step.id === PEOPLE_OVERVIEW_STEP_ID), false);
  assert.deepEqual(filtered.map((step) => step.id), ['welcome', 'project-overview', 'wrap-up']);
});

test('clampOnboardingStepIndex clamps to filtered sequence bounds', () => {
  assert.equal(clampOnboardingStepIndex(-5, 3), 0);
  assert.equal(clampOnboardingStepIndex(0, 3), 0);
  assert.equal(clampOnboardingStepIndex(4, 3), 2);
  assert.equal(clampOnboardingStepIndex('2', 3), 2);
});

test('getOnboardingStepUiState returns deterministic indicator and next/finish behavior', () => {
  const first = getOnboardingStepUiState(0, 3);
  assert.deepEqual(first, {
    index: 0,
    current: 1,
    total: 3,
    isFirstStep: true,
    isLastStep: false,
    nextAction: 'next'
  });

  const last = getOnboardingStepUiState(2, 3);
  assert.equal(last.current, 3);
  assert.equal(last.total, 3);
  assert.equal(last.isLastStep, true);
  assert.equal(last.nextAction, 'finish');

  const clampedLast = getOnboardingStepUiState(99, 3);
  assert.equal(clampedLast.index, 2);
  assert.equal(clampedLast.nextAction, 'finish');
});
