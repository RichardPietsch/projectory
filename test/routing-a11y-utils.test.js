const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveTabNavigationIndex,
  modalCloseRequestedByKeyboard
} = require('../public/js/routing-a11y-utils.js');

test('resolveTabNavigationIndex supports arrow/home/end navigation and wrapping', () => {
  assert.equal(resolveTabNavigationIndex(0, 'ArrowRight', 3), 1);
  assert.equal(resolveTabNavigationIndex(2, 'ArrowRight', 3), 0);
  assert.equal(resolveTabNavigationIndex(0, 'ArrowLeft', 3), 2);
  assert.equal(resolveTabNavigationIndex(1, 'Home', 3), 0);
  assert.equal(resolveTabNavigationIndex(1, 'End', 3), 2);
  assert.equal(resolveTabNavigationIndex(1, 'Enter', 3), -1);
});

test('resolveTabNavigationIndex returns -1 when total is invalid', () => {
  assert.equal(resolveTabNavigationIndex(0, 'ArrowRight', 0), -1);
  assert.equal(resolveTabNavigationIndex(0, 'ArrowRight', null), -1);
});

test('modalCloseRequestedByKeyboard only accepts Escape', () => {
  assert.equal(modalCloseRequestedByKeyboard({ key: 'Escape' }), true);
  assert.equal(modalCloseRequestedByKeyboard({ key: 'Enter' }), false);
  assert.equal(modalCloseRequestedByKeyboard(null), false);
});
