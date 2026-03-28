const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('frontend class contract check passes for current ui-* markup classes', () => {
  const scriptPath = path.join(__dirname, '../scripts/check-frontend-class-contract.js');
  const output = execFileSync(process.execPath, [scriptPath], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  });

  assert.match(output, /Frontend class contract check passed/);
});
