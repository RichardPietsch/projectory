const { execSync } = require('node:child_process');

function run(command, options = {}) {
  return execSync(command, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options
  }).trim();
}

function hasFileChanged(files, fileName) {
  return files.split('\n').map((entry) => entry.trim()).filter(Boolean).includes(fileName);
}

function fail(message, remediation = []) {
  console.error('Dependency/lockfile consistency check failed.');
  console.error(`- ${message}`);
  if (remediation.length > 0) {
    console.error('Fix instructions:');
    for (const line of remediation) console.error(`  ${line}`);
  }
  process.exit(1);
}

try {
  const baseRef = String(process.env.GITHUB_BASE_REF || '').trim();
  if (baseRef) {
    const changedFiles = run(`git diff --name-only origin/${baseRef}...HEAD`);
    const packageChanged = hasFileChanged(changedFiles, 'package.json');
    const lockChanged = hasFileChanged(changedFiles, 'package-lock.json');

    if (packageChanged && !lockChanged) {
      fail(
        'package.json changed in this PR but package-lock.json did not.',
        [
          'Run: npm install',
          'Commit the updated package-lock.json alongside package.json changes.'
        ]
      );
    }
  }

  run('npm install --package-lock-only --ignore-scripts --no-audit --no-fund', { stdio: 'pipe' });

  const lockDiff = run('git diff --name-only -- package-lock.json');
  if (lockDiff) {
    fail(
      'package-lock.json is out of sync with package.json (lockfile would change after install).',
      [
        'Run: npm install',
        'Commit the resulting package-lock.json update.'
      ]
    );
  }

  console.log('Dependency/lockfile consistency check passed.');
} catch (error) {
  fail(
    `Unable to complete lockfile consistency check: ${String(error?.message || error)}`,
    ['Verify git history is available and npm can run in this environment.']
  );
}
