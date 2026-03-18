const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('architecture fitness check has no legacy allowed edge bypass list', () => {
  const scriptPath = path.join(process.cwd(), 'scripts', 'architecture-fitness-check.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.equal(script.includes('LEGACY_ALLOWED_EDGES'), false);
});

test('architecture fitness check script passes', () => {
  const result = spawnSync('node', ['scripts/architecture-fitness-check.js'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Architecture fitness checks passed/);
});
