const fs = require('node:fs');

const CHECKLIST_PATH = 'docs/release-readiness-checklist.md';

const requiredControls = [
  'SEC-01', 'SEC-02', 'SEC-03',
  'REL-01', 'REL-02', 'REL-03',
  'OPS-01', 'OPS-02', 'OPS-03',
  'DATA-01', 'DATA-02',
  'IR-01', 'IR-02',
  'GNG-01', 'GNG-02', 'GNG-03', 'GNG-04'
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

if (!fs.existsSync(CHECKLIST_PATH)) {
  console.error(`Release readiness check failed: missing ${CHECKLIST_PATH}`);
  process.exit(1);
}

const checklist = fs.readFileSync(CHECKLIST_PATH, 'utf8');
const issues = [];

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

if (issues.length > 0) {
  console.error('Release readiness check failed.');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('Release readiness checklist check passed.');
