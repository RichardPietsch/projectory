# Testing Strategy

Projectory follows a pragmatic testing pyramid:

1. **Fast mocked/unit checks (default `npm test`)** for rapid feedback.
2. **Real-DB contract coverage (`RUN_DB_INTEGRATION=1 npm test`)** for high-risk API/database flows.
3. **Targeted migration invariants** to catch schema/index/constraint drift.

## 1) Fast local checks

- `npm run check:syntax`
- `npm test`

These should be run continuously while developing and before each commit.

## 2) Test layers

### A) Mocked smoke/API tests (fast)

Primary files:
- `test/app-smoke.test.js`
- `test/auth-foundation.test.js`

Purpose:
- verify endpoint contract shape and permission gates quickly
- exercise happy/error responses without requiring a live Postgres instance
- keep CI feedback loops short and deterministic

### B) Unit/schema validation tests (fast)

Primary files:
- `test/people-schema.test.js`
- `test/onboarding-schema.test.js`
- `test/auth-local-utils.test.js`

Purpose:
- validate payload normalization and schema logic in isolation
- ensure auth/password helper behavior remains stable

### C) Real-DB contract integration tests (required for release branches)

Primary files:
- `test/api-contract.db.test.js`
- `test/db-integration.test.js`

Run with:
- `RUN_DB_INTEGRATION=1 npm test`

Purpose:
- validate API behavior against real Postgres state transitions
- detect regressions where route contract and DB constraints diverge
- verify migration artifacts (tables/indexes/constraints) remain intact

## 3) Endpoints that require real-DB contract coverage

The following high-risk flows must keep non-mocked integration coverage:

- **Auth/session lifecycle**
  - `POST /api/auth/login`
  - `GET /api/auth/me`
  - `POST /api/auth/logout`
  - `POST /api/auth/forgot-password`
  - `POST /api/auth/reset-password`
- **Invite acceptance/auth bootstrap**
  - `POST /api/auth/invite-preview`
  - `POST /api/auth/accept-invite`
- **Admin user provisioning/invite lifecycle**
  - `POST /api/admin/users`
  - `POST /api/admin/users/:id/invite`
  - `POST /api/admin/users/:id/invite/revoke`
  - `GET /api/admin/users`
- **Import/export contracts**
  - `POST /api/import`
  - `GET /api/export`

These tests are focused on persistent side effects (insert/update/revoke/replace) and serialized payload contract stability.

## 4) Fixture/setup isolation rules

Real-DB suites must:

- reset mutable tables before each test (`TRUNCATE ... RESTART IDENTITY CASCADE`)
- recreate singleton settings rows (for example `smtp_settings.id = 1`) deterministically
- use unique suffixes/tokens for generated entities
- avoid network dependencies outside the local app + local Postgres

This keeps tests repeatable and makes failures actionable (API or schema regression instead of test flakiness).

## 5) CI expectations

- Pull request CI keeps fast checks enabled (`npm run lint:ci`, `npm run format:check`, `npm test`) for rapid feedback.
- `npm run lint:ci` is a unified lint workflow: ESLint static analysis (primary quality gate) plus architecture boundary checks.
- CI dependency installs use `npm ci` in Node jobs to enforce lockfile determinism and reduce supply-chain variance between runs.
- Pushes to `main` and `release/*` have an additional **mandatory** `release-db-contract-gate` job that runs:
  - `npm run release:readiness-check`
  - `npm run migrate`
  - `node --test test/api-contract.db.test.js test/db-integration.test.js`
- `npm run release:readiness-check` validates checklist control markers in `docs/release-readiness-checklist.md` plus required SLO/readiness artifacts and metric criteria.
- This release gate fails the pipeline on any checklist/readiness/migration/contract regression and is required before release promotion.
- Migration runner behavior for CI is deterministic (lexical SQL order via `scripts/run-migrations.js`); rollback expectation is restore-from-backup or follow-up corrective migration.
- Developers can still run the same gate locally with `RUN_DB_INTEGRATION=1 npm test` when validating DB-backed changes ahead of CI.
- Any new high-risk auth/admin/import-export endpoint should be added to both:
  - the real-DB contract suite, and
  - this strategy document.


## 6) Role-specific onboarding regression expectations (QA)

The onboarding walkthrough must remain deterministic per role.

Expected step visibility:

- `admin`: full walkthrough (includes People Overview step).
- `planner`: full walkthrough (includes People Overview step).
- `viewer`: full walkthrough (includes People Overview step).
- `teammate`: walkthrough excludes the People Overview step.

Guardrails:

- Teammate walkthrough must never navigate to the forbidden People Overview tab/step.
- Step indicator totals must match the filtered sequence length for the active role.
- Next/Finish behavior must be derived from filtered step order (last step shows Finish only on final visible step).

Regression coverage:

- `test/onboarding-tour.test.js` validates role-based filtering and step-state behavior.
- `public/js/onboarding-tour.js` is the single source of truth for role-specific tour filtering rules.
