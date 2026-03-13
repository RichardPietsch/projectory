const { execSync } = require('node:child_process');

function run(command, options = {}) {
  return execSync(command, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options
  }).trim();
}

function hasFileChanged(files, fileName) {
  return files
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(fileName);
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

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function readPackageJsonAtRef(ref) {
  const content = run(`git show ${ref}:package.json`);
  return JSON.parse(content);
}

function hasLockRelevantPackageJsonChanges(baseRef) {
  const lockRelevantKeys = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
    'bundledDependencies',
    'bundleDependencies',
    'overrides'
  ];

  try {
    const basePkg = readPackageJsonAtRef(`origin/${baseRef}`);
    const headPkg = readPackageJsonAtRef('HEAD');

    return lockRelevantKeys.some(
      (key) => stableStringify(basePkg[key]) !== stableStringify(headPkg[key])
    );
  } catch {
    const packageDiff = run(`git diff --unified=0 origin/${baseRef}...HEAD -- package.json`);
    if (!packageDiff) return false;

    return packageDiff
      .split('\n')
      .some((line) =>
        /^(\+|-)\s*"(dependencies|devDependencies|optionalDependencies|peerDependencies|bundledDependencies|bundleDependencies|overrides)"\s*:/.test(
          line
        )
      );
  }
}

try {
  const baseRef = String(process.env.GITHUB_BASE_REF || '').trim();
  if (baseRef) {
    const changedFiles = run(`git diff --name-only origin/${baseRef}...HEAD`);
    const packageChanged = hasFileChanged(changedFiles, 'package.json');
    const lockChanged = hasFileChanged(changedFiles, 'package-lock.json');

    if (packageChanged && !lockChanged && hasLockRelevantPackageJsonChanges(baseRef)) {
      fail('package.json dependency metadata changed in this PR but package-lock.json did not.', [
        'Run: npm install',
        'Commit the updated package-lock.json alongside package.json dependency changes.'
      ]);
    }
  }

  run('npm install --package-lock-only --ignore-scripts --no-audit --no-fund', { stdio: 'pipe' });

  const lockDiff = run('git diff --name-only -- package-lock.json');
  if (lockDiff) {
    fail('package-lock.json is out of sync with package.json (lockfile would change after install).', [
      'Run: npm install',
      'Commit the resulting package-lock.json update.'
    ]);
  }

  console.log('Dependency/lockfile consistency check passed.');
} catch (error) {
  fail(`Unable to complete lockfile consistency check: ${String(error?.message || error)}`, [
    'Verify git history is available and npm can run in this environment.'
  ]);
}
