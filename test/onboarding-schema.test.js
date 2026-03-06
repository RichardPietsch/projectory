const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateOnboardingProfilePayload,
  validateOnboardingStepPayload,
  normalizeOnboardingStatus
} = require('../src/modules/onboarding/schema');

test('normalizeOnboardingStatus defaults and normalizes values', () => {
  assert.equal(normalizeOnboardingStatus(undefined), 'planned');
  assert.equal(normalizeOnboardingStatus('IN_PROGRESS'), 'in_progress');
});

test('validateOnboardingProfilePayload rejects invalid startDate', () => {
  const result = validateOnboardingProfilePayload({
    firstName: 'New',
    lastName: 'Hire',
    startDate: 'not-a-date'
  });

  assert.equal(result.error, 'startDate must be a valid date string.');
});

test('validateOnboardingStepPayload requires step key and label', () => {
  const result = validateOnboardingStepPayload({ stepKey: 'it-setup' });
  assert.equal(result.error, 'stepKey and label are required.');
});
