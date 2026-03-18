const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function run(command, cwd) {
  execSync(command, {
    cwd,
    stdio: 'inherit'
  });
}

function fail(message) {
  console.error('npm ci repeatability check failed.');
  console.error(`- ${message}`);
  console.error('Fix instructions:');
  console.error('  1) Ensure package-lock.json is committed and up to date.');
  console.error('  2) Re-run: npm ci locally from a clean checkout.');
  process.exit(1);
}

const root = process.cwd();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectory-npmci-'));

try {
  fs.copyFileSync(path.join(root, 'package.json'), path.join(tmpDir, 'package.json'));
  fs.copyFileSync(path.join(root, 'package-lock.json'), path.join(tmpDir, 'package-lock.json'));

  run('npm ci --ignore-scripts --no-audit --no-fund', tmpDir);
  fs.rmSync(path.join(tmpDir, 'node_modules'), { recursive: true, force: true });
  run('npm ci --ignore-scripts --no-audit --no-fund', tmpDir);

  console.log('npm ci repeatability check passed (fresh workspace install twice).');
} catch (error) {
  fail(String(error?.message || error));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
