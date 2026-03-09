# Projectory

Projectory is a challenge-first planning workspace for client teams.

Instead of starting with “who is free?”, Projectory starts with **what the client actually needs**:
1. Define project challenges.
2. Assign the right people.
3. Clarify responsibility with owner/leader roles.
4. Keep workloads transparent across all assignments.

The result is a practical operating view for delivery teams: clearer ownership, better staffing conversations, and a shared picture of project health.

---

## What Projectory helps you do

### 1) Build a client team around real challenges
- Organize work per **Client → Project → Challenge**.
- Assign contributors and define role overlays (Owner / Leader).
- Keep team composition visible as challenge assignments evolve.

### 2) Manage people capacity with context
- Track people by trade, level, status, and working hours.
- See assignment counts, role distribution, and total workload in one place.
- Adjust assignment quantity and keep workload discussions grounded in project reality.

### 3) Operate with consistent governance
- Role-aware permissions (`admin`, `planner`, `viewer`).
- Admin configuration for static catalogs (e.g., trades and levels).
- Built-in import/export for operational data and configuration data.

### 4) Onboard teams quickly
- Included onboarding flow explains how to use Projectory in a practical sequence.
- Helps new users understand challenge-first planning and role semantics.

---

## Core concepts

- **Person**: first/last name, trade, level, status, working hours, visibility flags
- **Client**: account-level metadata including priority
- **Project**: client-owned delivery container with status, dates, and budget
- **Challenge**: actionable requirement/problem inside a project
- **Assignment**: link between person and challenge, with quantity + role flags
- **Onboarding Profile**: optional guided onboarding progress model

---

## How people use it (typical flow)

1. Open **Client Teams** overview and pick a project.
2. Capture/curate project challenges.
3. Assign people to challenges and apply owner/leader roles where needed.
4. Review generated team composition and workload indicators.
5. Iterate as priorities shift.
6. Use admin/configuration and import/export when organizational catalogs or data transfers are needed.

---

## Run locally (Docker, recommended)

```bash
docker compose up --build
```

App: <http://localhost:3000>

### Role-specific compose options

```bash
# admin-default
curl -fsSL https://raw.githubusercontent.com/RichardPietsch/projectory/main/docker-compose.admin.yml | docker compose -f - up --build

# planner-default
curl -fsSL https://raw.githubusercontent.com/RichardPietsch/projectory/main/docker-compose.planner.yml | docker compose -f - up --build

# viewer-default
curl -fsSL https://raw.githubusercontent.com/RichardPietsch/projectory/main/docker-compose.viewer.yml | docker compose -f - up --build
```

`docker-compose.admin.yml` also exposes Adminer at <http://localhost:8080>.

---


## Environment profiles and security defaults

Use the provided examples as a starting point:

- local only: `.env.local.example`
- staging/production baseline: `.env.nonlocal.example`

### Critical safety rules

- Never promote local defaults (`DB_USER=projectory_local_user`, `DB_PASSWORD=projectory_local_password`, `AUTH_ALLOW_HEADER_SIMULATION=true`) into non-local environments.
- Non-local runtime is validated at startup and fails fast when required credentials/secrets are missing.
- `AUTH_MODE` must remain `session` outside local development.
- `SMTP_PASSWORD_ENCRYPTION_KEY` is required in non-local runtime and must be a strong secret (minimum 32 characters).

## First-run example dataset

Fresh installs now seed a small example workspace automatically via migrations:

- 1 example client: `Example Client GmbH`
- 1 example project: `Example Website Relaunch`
- 3 example users linked to people records:
  - Olivia Owner (owner assignment)
  - Liam Lead (lead assignment)
  - Casey Contributor (contributor assignment)
- challenges + assignments within the example project showing owner/lead/contributor roles

This dataset is idempotent and is only inserted once per database.

## Import / Export

Projectory supports two portability scopes:

1. **Application data**
   - clients, projects, people, challenges, assignments
   - JSON / CSV

2. **Configuration data**
   - static catalogs such as trades and levels
   - JSON / CSV

This separation allows operational data migration without forcing catalog changes (and vice versa).

---

## Permissions and roles

- `admin`: full access including admin configuration and import
- `planner`: planning/editing access with restricted admin capabilities
- `viewer`: read-only access for transparency
- `teammate`: scoped collaborator access on assigned projects (challenge/assignment maintenance)

Headers for local role simulation (only when explicitly enabled):
- `x-projectory-user-id`
- `x-projectory-user-email`
- `x-projectory-user-name`
- `x-projectory-user-role`

### Auth runtime safety matrix

| Environment | `AUTH_MODE` | `AUTH_ALLOW_HEADER_SIMULATION` | Expected behavior |
|---|---|---|---|
| local/dev (`AUTH_LOCAL_DEV=true`) | default `session` (can be set to `hybrid`/`header` for local-only troubleshooting) | **must be set to `true`** to use header simulation | Header-based simulation is available only with explicit opt-in |
| non-local (`staging`, `production`, etc.) | **must be `session`** | **must be `false` / unset** | Startup fails fast on unsafe combinations and missing required credentials/secrets |

Additional auth env defaults:
- `AUTH_MODE` defaults to `session`.
- `AUTH_DEFAULT_ROLE` is only used when local header simulation is enabled; otherwise requests default to `viewer` until session auth is established.

Audit log retention can be tuned with `AUDIT_LOG_RETENTION_MONTHS` (defaults to `6`).

Password reset journey is available via `POST /api/auth/forgot-password` (request e-mail link) and `POST /api/auth/reset-password` (consume token), with reset landing route at `/reset-password?token=...`.

---



## Health and metrics

- Liveness probe: `GET /health/live`
- Readiness probe: `GET /health/ready`
- Backward-compatible readiness alias: `GET /health`
- Prometheus metrics: `GET /metrics`

Operational semantics, baseline alerts, and dashboard guidance are documented in `docs/observability.md`.



### Frontend CDN hardening note

- Runtime third-party script usage was reduced by removing the Iconify CDN dependency and replacing it with a local inline icon in the onboarding trigger.
- Tailwind Play CDN is still used for now; CSP only allows `self` plus `https://cdn.tailwindcss.com` for scripts.
- This reduces browser-time supply-chain exposure compared with multiple script CDNs while preserving current UI behavior.
- Recommended next step: self-host a pinned frontend build artifact and remove Tailwind CDN entirely.

### Distributed rate limiting

Rate limiting now uses a shared Postgres-backed bucket table (`rate_limit_buckets`) to keep throttling behavior consistent across multiple app instances.

Operational tuning:
- `REQUEST_RATE_LIMIT_MAX` and `REQUEST_RATE_LIMIT_WINDOW_MS` control global request throttling.
- Route-specific windows remain configurable (for example `AUTH_FORGOT_PASSWORD_RATE_LIMIT_*`, `SPA_SHELL_RATE_LIMIT_*`).
- `RATE_LIMIT_DISTRIBUTED_RETENTION_MS` controls bucket retention/cleanup horizon for shared buckets.

If shared bucket writes are temporarily unavailable, the app falls back to process-local buckets to preserve protection and retry headers.

## Localization parity checks

To prevent locale drift between supported languages, run:

```bash
npm run locale:check
```

This command is CI-gated and fails when `en`/`de` locale key sets diverge (except explicit temporary exceptions in `scripts/locale-key-exceptions.json`) or when exception entries become stale.
See `docs/localization.md` for remediation workflow.
For QA stress runs against hardcoded text and truncation issues, use pseudo locale via the language switcher or `?qaLocale=pseudo` (documented checklist + caveats in `docs/localization.md`).

## Architecture governance (ADRs + boundaries)

- Architecture decisions are tracked in `docs/adr/`.
- Use `docs/adr/0000-template.md` for new records and see `docs/adr/README.md` for required scope (auth/data/infra).
- Contributor expectations and boundary rules are documented in `CONTRIBUTING.md`.
- CI runs lightweight boundary checks via `npm run lint:ci` to prevent module boundary drift.

## Migrations

```bash
npm run migrate:status
npm run migrate
```

Migration state is tracked in `schema_migrations`.

---


## Container runtime hardening and reproducibility

- The application image is built from `node:20-alpine` and installs dependencies with `npm ci` using `package-lock.json`.
- The container process runs as the non-root `node` user (least privilege) by default.
- Rebuild determinism expectation: with the same `Dockerfile`, base image digest, `package.json`, and `package-lock.json`, the dependency tree is reproducible.

### Reproducible local build

```bash
docker build --pull -t projectory:local .
```

If the lockfile changes unexpectedly, re-run:

```bash
npm install --package-lock-only
```

and commit `package-lock.json` together with `package.json` changes.

### CI vulnerability triage policy

- CI runs Trivy filesystem and image scans and fails on **critical** vulnerabilities.
- Temporary exceptions must be tracked in `.trivyignore` with an issue/PR reference and expiry date.
- Keep `.trivyignore` small and time-bound; remove entries as soon as patched images/dependencies are available.

### Troubleshooting reproducibility failures

1. Ensure `package-lock.json` is committed and in sync with `package.json`.
2. Rebuild with `--pull` to get the latest base image metadata.
3. Pin base image by digest for stricter reproducibility if required by your release process.
4. If Trivy fails on a critical finding, update/patch dependencies or base image first; use `.trivyignore` only for short, documented exceptions.
5. For image-scan failures, rebuild with the latest base image metadata (`docker build --pull ...`) and confirm the Dockerfile base tag still points to a patched release line.
6. Re-run a local image scan to validate remediation before pushing:

```bash
trivy image --severity CRITICAL,HIGH --ignore-unfixed projectory:local
```

---

## Quality checks

```bash
npm run check:syntax
npm test
```

CI (`.github/workflows/ci.yml`) runs migrations + syntax + tests on push/PR.

---

## Documentation

- `docs/architecture.md`
- `docs/api-authz-matrix.md`
- `docs/module-template.md`
- `docs/testing-strategy.md`
- `docs/localization.md`

