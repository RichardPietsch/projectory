const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runCheck(targetDir) {
  return spawnSync('node', ['scripts/check-frontend-dom-safety.js', targetDir], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
}

test('frontend dom safety check fails on non-literal innerHTML assignment', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dom-safety-fail-'));
  const targetDir = path.join(tmpRoot, 'public-js');
  fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(path.join(targetDir, 'unsafe.js'), "const val = userInput;\nnode.innerHTML = `<div>${val}</div>`;\n", 'utf8');

  const result = runCheck(targetDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Frontend DOM safety check failed/);
});

test('frontend dom safety check allows explicit reviewed marker', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dom-safety-allow-'));
  const targetDir = path.join(tmpRoot, 'public-js');
  fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(
    path.join(targetDir, 'allow.js'),
    "// dom-safety-allow: reviewed renderer\nnode.innerHTML = renderHtml();\n",
    'utf8'
  );

  const result = runCheck(targetDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Frontend DOM safety check passed/);
});

test('frontend dom safety check allows literal clear assignment', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dom-safety-literal-'));
  const targetDir = path.join(tmpRoot, 'public-js');
  fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(path.join(targetDir, 'literal.js'), "node.innerHTML = '';\n", 'utf8');

  const result = runCheck(targetDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
