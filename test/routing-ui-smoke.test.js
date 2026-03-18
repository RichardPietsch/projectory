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
  assert.match(challengesSource, /shouldClosePeopleOverviewOnKeyboard\(event\)/);
  assert.match(challengesSource, /closePeopleOverviewModal\(\)/);
  assert.match(challengesSource, /peopleOverviewFocusReturnTarget/);
});


test('onboarding popover z-index stays above highlighted target', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(indexHtml, /id="onboarding-popover" class="fixed z-\[82\]/);
  assert.match(challengesSource, /'z-\[81\]'/);
});


test('client teams overview includes mobile card list and explicit sort select', () => {
  assert.match(challengesSource, /id=\"client-teams-mobile-list\" class=\"space-y-3 md:hidden\"/);
  assert.match(challengesSource, /id=\"client-teams-sort-select\"/);
  assert.match(challengesSource, /window\.setClientTeamsSort = function setClientTeamsSort\(value\)/);
});


test('project detail challenge overview includes mobile cards and explicit sort control', () => {
  assert.match(challengesSource, /id="project-detail-challenge-mobile-list" class="space-y-3 lg:hidden"/);
  assert.match(challengesSource, /id="challenge-sort-select"/);
  assert.match(challengesSource, /window\.setChallengesSort = function setChallengesSort\(value\)/);
});
