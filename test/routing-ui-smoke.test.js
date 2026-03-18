const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routingUiSource = fs.readFileSync(path.join(__dirname, '../public/js/app-routing-ui.js'), 'utf8');
const challengesSource = fs.readFileSync(path.join(__dirname, '../public/js/app-projects-challenges.js'), 'utf8');

test('home tab nav includes keyboard listener and tab semantics', () => {
  assert.match(routingUiSource, /setAttribute\('role', 'tablist'\)/);
  assert.match(routingUiSource, /setAttribute\('role', 'tab'\)/);
  assert.match(routingUiSource, /resolveTabNavigationIndex\(currentIndex, event.key, tabButtons.length\)/);
});

test('people overview modal keyboard close + focus restore wiring exists', () => {
  assert.match(challengesSource, /modalCloseRequestedByKeyboard\(event\)/);
  assert.match(challengesSource, /closePeopleOverviewModal\(\)/);
  assert.match(challengesSource, /peopleOverviewFocusReturnTarget/);
});
