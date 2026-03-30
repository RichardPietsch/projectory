const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('deprecated css class checker runs and reports summary output', () => {
  const scriptPath = path.join(__dirname, '../scripts/check-deprecated-css-classes.js');
  const output = execFileSync(process.execPath, [scriptPath], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  });

  assert.match(output, /(Deprecated CSS class usage detected|Deprecated CSS class usage check passed)/);
});
