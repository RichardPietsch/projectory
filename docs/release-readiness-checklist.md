# Public Rollout Release Readiness Checklist

This checklist is a **hard go/no-go gate** for public rollout.
All required controls must be checked (`[x]`) and their evidence artifacts must exist in-repo.

## Security controls (required)

- [x] [SEC-01] Auth/session hardening is enabled and validated in automated tests. (evidence: `test/auth-foundation.test.js`, `test/session-proxy-cookie-security.test.js`)
- [x] [SEC-02] CSRF protections are enabled for session-authenticated mutating requests. (evidence: `src/app/csrf.js`, `test/csrf-integration.test.js`)
- [x] [SEC-03] Secret scanning and dependency/image security checks are active in CI. (evidence: `.github/workflows/ci.yml`, `.trivyignore`)

## Reliability controls (required)

- [x] [REL-01] DB migrations are applied successfully in release CI path before promotion. (evidence: `scripts/run-migrations.js`, `.github/workflows/ci.yml`)
- [x] [REL-02] Real-DB contract/integration suites pass in release CI path. (evidence: `test/api-contract.db.test.js`, `test/db-integration.test.js`, `.github/workflows/ci.yml`)
- [x] [REL-03] Architecture/layer boundary checks are enforced. (evidence: `scripts/architecture-fitness-check.js`, `test/architecture-fitness-check.test.js`)

## Operability controls (required)

- [x] [OPS-01] SLO baseline definitions are versioned and reviewed. (evidence: `docs/operations/slo-baseline.md`)
- [x] [OPS-02] Alert rules and dashboard artifacts exist for SLI monitoring. (evidence: `ops/alerts/projectory-slo-alerts.yml`, `ops/dashboards/projectory-slo-dashboard.json`)
- [x] [OPS-03] Operational readiness script validates SLO metric usage and runbook tie-in. (evidence: `scripts/check-operational-readiness.js`, `docs/runbooks/slo-remediation.md`)

## Data safety controls (required)

- [x] [DATA-01] Schema is migration-managed and state transitions are auditable. (evidence: `db/migrations/`, `db/migrations/0008_audit_log_foundation.sql`)
- [x] [DATA-02] Release DB contract gate remains active on `main` / `release/*` pushes. (evidence: `.github/workflows/ci.yml`)

## Incident readiness controls (required)

- [x] [IR-01] SLO remediation runbook includes rollback and escalation guidance. (evidence: `docs/runbooks/slo-remediation.md`)
- [x] [IR-02] Release gate tie-in forbids promotion while page-severity SLO alerts are active. (evidence: `docs/runbooks/slo-remediation.md`)


## CI evidence integrity controls (required)

- [x] [EVD-01] Release gate generates `ci-artifacts/release-evidence-manifest.json` with commit sha, generated timestamp, and sha256 hashes for required evidence files.
- [x] [EVD-02] Required evidence files (`release-db-migrate.txt`, `release-readiness.txt`, `release-db-contract-tests.txt`) include matching `evidence_commit_sha` and `evidence_generated_at` markers.
- [x] [EVD-03] Release readiness checker validates evidence freshness (max age), commit-sha match, and evidence hash integrity before promotion.

## SLO / readiness go-no-go criteria (required)

A release is **NO-GO** unless all of the following are true:

- [x] [GNG-01] `npm run ops:readiness-check` passes (SLO artifacts + metric wiring valid), and CI evidence validation passes when run with `--require-evidence`.
- [x] [GNG-02] No page-severity SLO alerts are firing at decision time.
- [x] [GNG-03] `release-db-contract-gate` in CI is green, including migrations and real-DB contract suites.
- [x] [GNG-04] This checklist remains fully checked for all required controls above.

Required SLI metrics for go/no-go evidence:

- `projectory_http_request_errors_total`
- `projectory_http_request_duration_ms_bucket`
- `projectory_db_query_errors_total`
- `projectory_db_query_duration_ms_bucket`
