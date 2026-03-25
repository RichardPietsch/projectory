const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CHECKLIST_PATH = 'docs/release-readiness-checklist.md';

const requiredControls = [
  'SEC-01', 'SEC-02', 'SEC-03',
  'REL-01', 'REL-02', 'REL-03',
  'OPS-01', 'OPS-02', 'OPS-03',
  'DATA-01', 'DATA-02',
  'IR-01', 'IR-02',
  'GNG-01', 'GNG-02', 'GNG-03', 'GNG-04',
  'EVD-01', 'EVD-02', 'EVD-03'
];

const requiredArtifacts = [
  '.github/workflows/ci.yml',
  'docs/operations/slo-baseline.md',
  'docs/runbooks/slo-remediation.md',
  'ops/alerts/projectory-slo-alerts.yml',
  'ops/dashboards/projectory-slo-dashboard.json',
  'scripts/check-operational-readiness.js',
  'scripts/run-migrations.js',
  'scripts/architecture-fitness-check.js',
  'test/architecture-fitness-check.test.js',
  'test/api-contract.db.test.js',
  'test/db-integration.test.js',
  'db/migrations/0008_audit_log_foundation.sql'
];

const requiredMetricSnippets = [
  'projectory_http_request_errors_total',
  'projectory_http_request_duration_ms_bucket',
  'projectory_db_query_errors_total',
  'projectory_db_query_duration_ms_bucket'
];

const requiredEvidenceFiles = [
  'release-db-migrate.txt',
  'release-readiness.txt',
  'release-db-contract-tests.txt'
];

function parseArgs(argv) {
  const options = {
    requireEvidence: false,
    evidenceDir: 'ci-artifacts',
    expectedCommit: '',
    maxAgeMinutes: 180
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--require-evidence') {
      options.requireEvidence = true;
      continue;
    }
    if (arg === '--evidence-dir') {
      options.evidenceDir = argv[index + 1] || options.evidenceDir;
      index += 1;
      continue;
    }
    if (arg === '--expected-commit') {
      options.expectedCommit = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (arg === '--max-age-minutes') {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.maxAgeMinutes = parsed;
      }
      index += 1;
    }
  }

  return options;
}

function sha256ForFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function validateChecklistAndArtifacts(issues) {
  if (!fs.existsSync(CHECKLIST_PATH)) {
    issues.push(`Missing ${CHECKLIST_PATH}.`);
    return;
  }

  const checklist = fs.readFileSync(CHECKLIST_PATH, 'utf8');

  for (const controlId of requiredControls) {
    const checkedPattern = new RegExp(`^- \\[x\\] \\[${controlId}\\]`, 'm');
    if (!checkedPattern.test(checklist)) {
      issues.push(`Control ${controlId} must exist and be checked ([x]) in ${CHECKLIST_PATH}.`);
    }
  }

  for (const artifact of requiredArtifacts) {
    if (!fs.existsSync(artifact)) {
      issues.push(`Missing required release evidence artifact: ${artifact}`);
    }
  }

  for (const metric of requiredMetricSnippets) {
    if (!checklist.includes(metric)) {
      issues.push(`Checklist must include go/no-go SLI metric reference: ${metric}`);
    }
  }

  if (!checklist.includes('NO-GO') || !checklist.includes('go/no-go')) {
    issues.push('Checklist must define explicit go/no-go semantics for release promotion.');
  }
}

function validateEvidenceFiles(options, issues) {
  const evidenceDir = path.resolve(process.cwd(), options.evidenceDir);
  const manifestPath = path.join(evidenceDir, 'release-evidence-manifest.json');

  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) {
    issues.push(`Evidence directory missing: ${options.evidenceDir}`);
    return;
  }

  if (!fs.existsSync(manifestPath)) {
    issues.push(`Missing evidence manifest: ${path.relative(process.cwd(), manifestPath)}`);
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    issues.push(`Invalid JSON evidence manifest: ${error.message}`);
    return;
  }

  const generatedAt = Date.parse(manifest.generated_at || '');
  if (!Number.isFinite(generatedAt)) {
    issues.push('Evidence manifest must include valid generated_at timestamp.');
  } else {
    const ageMinutes = (Date.now() - generatedAt) / (60 * 1000);
    if (ageMinutes > options.maxAgeMinutes) {
      issues.push(`Evidence manifest is stale (${ageMinutes.toFixed(1)} minutes old; max ${options.maxAgeMinutes}).`);
    }
  }

  const commitSha = String(manifest.commit_sha || '').trim();
  if (!commitSha) {
    issues.push('Evidence manifest must include commit_sha.');
  }

  if (options.expectedCommit && commitSha && commitSha !== options.expectedCommit) {
    issues.push(`Evidence commit mismatch: expected ${options.expectedCommit} but manifest has ${commitSha}.`);
  }

  const filesMap = manifest.files && typeof manifest.files === 'object' ? manifest.files : {};
  for (const fileName of requiredEvidenceFiles) {
    const filePath = path.join(evidenceDir, fileName);
    if (!fs.existsSync(filePath)) {
      issues.push(`Missing required evidence file: ${path.relative(process.cwd(), filePath)}`);
      continue;
    }

    const expected = filesMap[fileName];
    if (!expected || !expected.sha256) {
      issues.push(`Manifest missing hash entry for evidence file: ${fileName}`);
      continue;
    }

    const actualSha = sha256ForFile(filePath);
    if (actualSha !== expected.sha256) {
      issues.push(`Evidence hash mismatch for ${fileName}. expected=${expected.sha256} actual=${actualSha}`);
    }

    const text = fs.readFileSync(filePath, 'utf8');
    if (!text.includes(`evidence_commit_sha=${commitSha}`)) {
      issues.push(`Evidence commit marker missing/mismatched in ${fileName}.`);
    }

    if (!text.includes(`evidence_generated_at=${manifest.generated_at}`)) {
      issues.push(`Evidence timestamp marker missing/mismatched in ${fileName}.`);
    }
  }
}

function run() {
  const options = parseArgs(process.argv);
  const issues = [];

  validateChecklistAndArtifacts(issues);
  if (options.requireEvidence) {
    validateEvidenceFiles(options, issues);
  }

  if (issues.length > 0) {
    console.error('Release readiness check failed.');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  if (options.requireEvidence) {
    console.log('Release readiness checklist + evidence checks passed.');
  } else {
    console.log('Release readiness checklist check passed.');
  }
}

run();
