const test = require('node:test');
const assert = require('node:assert/strict');

const { validatePersonPayload } = require('../src/modules/people/schema');

function parseWorkingHours(value) {
  if (value === undefined || value === null || value === '') return 40;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

test('validatePersonPayload normalizes valid payload and defaults status semantics', () => {
  const result = validatePersonPayload(
    {
      firstName: ' Ada ',
      lastName: ' Lovelace ',
      tradeId: 1,
      levelId: 2,
      workingHours: 40
    },
    parseWorkingHours
  );

  assert.equal(result.error, undefined);
  assert.equal(result.value.firstName, 'Ada');
  assert.equal(result.value.lastName, 'Lovelace');
  assert.equal(result.value.parsedWorkingHours, 40);
  assert.equal(result.value.hasStatus, false);
  assert.equal(result.value.normalizedStatus, null);
});

test('validatePersonPayload rejects invalid status', () => {
  const result = validatePersonPayload(
    {
      firstName: 'Ada',
      lastName: 'Lovelace',
      tradeId: 1,
      levelId: 2,
      workingHours: 40,
      status: 'unknown'
    },
    parseWorkingHours
  );

  assert.equal(result.error, 'status must be one of: active, paused, leaver.');
});
