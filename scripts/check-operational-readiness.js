const fs = require('node:fs');

const requiredFiles = [
  'ops/alerts/projectory-slo-alerts.yml',
  'ops/dashboards/projectory-slo-dashboard.json',
  'docs/runbooks/slo-remediation.md',
  'docs/operations/slo-baseline.md'
];

const requiredMetricSnippets = [
  'projectory_http_request_errors_total',
  'projectory_http_request_duration_ms_bucket',
  'projectory_db_query_errors_total',
  'projectory_db_query_duration_ms_bucket'
];

const missing = requiredFiles.filter((file) => !fs.existsSync(file));
if (missing.length > 0) {
  console.error('Operational readiness check failed: missing files.');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const alertsText = fs.readFileSync('ops/alerts/projectory-slo-alerts.yml', 'utf8');
const dashboardText = fs.readFileSync('ops/dashboards/projectory-slo-dashboard.json', 'utf8');
const runbookText = fs.readFileSync('docs/runbooks/slo-remediation.md', 'utf8');

const issues = [];
for (const metric of requiredMetricSnippets) {
  if (!alertsText.includes(metric) && !dashboardText.includes(metric)) {
    issues.push(`Missing SLI metric usage for ${metric} in alert/dashboard artifacts.`);
  }
}

if (!runbookText.includes('Release gate tie-in')) {
  issues.push('Runbook must include release gate tie-in section.');
}

if (issues.length > 0) {
  console.error('Operational readiness check failed.');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log('Operational readiness artifacts check passed.');
