const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function writeEvidenceSet({ dir, commitSha, generatedAt, includeContractFile = true, staleManifest = false }) {
  fs.mkdirSync(dir, { recursive: true });

  const fileNames = ['release-db-migrate.txt', 'release-readiness.txt'];
  if (includeContractFile) {
    fileNames.push('release-db-contract-tests.txt');
  }

  for (const name of fileNames) {
    fs.writeFileSync(
      path.join(dir, name),
      `artifact=${name}\nevidence_commit_sha=${commitSha}\nevidence_generated_at=${generatedAt}\n`,
      'utf8'
    );
  }

  const manifestGeneratedAt = staleManifest ? '2001-01-01T00:00:00Z' : generatedAt;
  const files = {};
  for (const name of ['release-db-migrate.txt', 'release-readiness.txt', 'release-db-contract-tests.txt']) {
    const full = path.join(dir, name);
    if (!fs.existsSync(full)) continue;
    const sha = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    files[name] = { sha256: sha, bytes: fs.statSync(full).size };
  }

  fs.writeFileSync(path.join(dir, 'release-evidence-manifest.json'), JSON.stringify({
    generated_at: manifestGeneratedAt,
    commit_sha: commitSha,
    files
  }, null, 2));
}

function runEvidenceCheck(evidenceDir, commitSha) {
  return spawnSync('node', [
    'scripts/check-release-readiness.js',
    '--require-evidence',
    '--evidence-dir',
    evidenceDir,
    '--expected-commit',
    commitSha,
    '--max-age-minutes',
    '180'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
}

test('release readiness evidence check passes with fresh matching manifest + artifacts', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-readiness-evidence-pass-'));
  const evidenceDir = path.join(tmpRoot, 'ci-artifacts');
  const commitSha = 'abc123def';
  const generatedAt = new Date().toISOString();

  writeEvidenceSet({ dir: evidenceDir, commitSha, generatedAt, includeContractFile: true });

  const result = runEvidenceCheck(evidenceDir, commitSha);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /evidence checks passed/);
});

test('release readiness evidence check fails when required evidence file is missing', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-readiness-evidence-missing-'));
  const evidenceDir = path.join(tmpRoot, 'ci-artifacts');
  const commitSha = 'abc123def';
  const generatedAt = new Date().toISOString();

  writeEvidenceSet({ dir: evidenceDir, commitSha, generatedAt, includeContractFile: false });

  const result = runEvidenceCheck(evidenceDir, commitSha);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required evidence file/);
});

test('release readiness evidence check fails when manifest is stale', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-readiness-evidence-stale-'));
  const evidenceDir = path.join(tmpRoot, 'ci-artifacts');
  const commitSha = 'abc123def';
  const generatedAt = new Date().toISOString();

  writeEvidenceSet({ dir: evidenceDir, commitSha, generatedAt, includeContractFile: true, staleManifest: true });

  const result = runEvidenceCheck(evidenceDir, commitSha);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Evidence manifest is stale/);
});
