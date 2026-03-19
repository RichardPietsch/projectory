const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('release readiness check script passes', () => {
  const result = spawnSync('node', ['scripts/check-release-readiness.js'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Release readiness checklist check passed/);
});
