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

Headers for local role simulation:
- `x-projectory-user-id`
- `x-projectory-user-email`
- `x-projectory-user-name`
- `x-projectory-user-role`

Default role is controlled by `AUTH_DEFAULT_ROLE` (defaults to `admin`).

Audit log retention can be tuned with `AUDIT_LOG_RETENTION_MONTHS` (defaults to `6`).

---

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

