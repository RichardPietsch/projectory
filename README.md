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

---

## Migrations

```bash
npm run migrate:status
npm run migrate
```

Migration state is tracked in `schema_migrations`.

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

