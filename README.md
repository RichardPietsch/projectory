# Projectory Resource Planner (Docker + Tailwind + PostgreSQL)

Browser-based resource planning tool with three management views:
- **People View**
- **Client View**
- **Project View**

## What v1 includes

### Entities
- **Person**: first name, last name, trade, level, status (`active`/`paused`/`leaver`), working hours (default 40), optional `isHidden` + `isLeaver` flags
- **Client**: name, location, since month (`yyyy-mm`), priority
- **Project**: belongs to exactly one client, start/end month (`yyyy-mm`), budget entered in **euros** (stored as cents internally)
- **Challenge**: belongs to a project
- **Assignment**: links person + project + challenge with optional `isOwner` or `isLeader`
- **Onboarding Profile**: optional person-linked onboarding workflow with progress steps

### Business rules implemented
- Footer actions export/import operational data as JSON (clients, projects, people, challenges, assignments). Static lists (priorities, trades, levels) are excluded and cannot be changed via import/export. Import performs strict schema/reference validation and rejects malformed files.
- Static lists are pre-seeded on DB startup:
  - Priorities: Prio 1..4
  - Trades: UX, UI, DATA, STRATEGY, CONSULTING, DEV-FE, DEV-BE, DEV-FULLSTACK, DEV-OPS, ART, COPY, CREATIVE, IT, HR, ACCOUNT, PO, TPM, MANAGEMENT, ADMIN, CONTROLLING, TEMP, STUDENT
  - Levels: —, JUNIOR, MIDWEIGHT, SENIOR, DIRECTOR, C-LEVEL
- A project must belong to one client.
- An assignment cannot be both owner and leader at once.
- The same person cannot be assigned to the same challenge more than once.
- Multiple owners/leaders per project are allowed.
- Deleting records is blocked if dependencies exist (FK restrict behavior).
- Assignment `quantity` is auto-split equally across a person's assigned projects and always sums to 100%.
- A person with `isHidden=true` is hidden from non-admin views only when they have no challenge assignments; assigned people remain visible.

## Run locally with Docker Desktop (recommended)

```bash
docker compose up --build
```

Open: <http://localhost:3000>

## Role-specific no-clone compose files

For quick role testing with default auth role preconfigured:

```bash
# admin-default
curl -fsSL https://raw.githubusercontent.com/RichardPietsch/projectory/main/docker-compose.admin.yml | docker compose -f - up --build

# viewer-default
curl -fsSL https://raw.githubusercontent.com/RichardPietsch/projectory/main/docker-compose.viewer.yml | docker compose -f - up --build

# planner-default
curl -fsSL https://raw.githubusercontent.com/RichardPietsch/projectory/main/docker-compose.planner.yml | docker compose -f - up --build
```

## No-clone run from GitHub (your repo)

```bash
curl -fsSL https://raw.githubusercontent.com/RichardPietsch/projectory/main/docker-compose.admin.yml \
| docker compose -f - up --build
```

If raw GitHub file is missing, use this fallback:

```bash
cat <<'YAML' | docker compose -f - up --build
services:
  web:
    build:
      context: https://github.com/RichardPietsch/projectory.git#main
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      DB_HOST: db
      DB_PORT: 5432
      DB_NAME: helloapp
      DB_USER: hello
      DB_PASSWORD: hello
    depends_on:
      db:
        condition: service_healthy

  db:
    build:
      context: https://github.com/RichardPietsch/projectory.git#main:db
    environment:
      POSTGRES_DB: helloapp
      POSTGRES_USER: hello
      POSTGRES_PASSWORD: hello
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hello -d helloapp"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
YAML
```


## Database migrations

The project now includes a migration foundation under `db/migrations/` with baseline schema in `0001_init.sql` and an incremental people-status migration in `0003_people_status.sql`, and onboarding foundation migration `0004_onboarding_foundation.sql`.

```bash
# Show pending migrations
npm run migrate:status

# Apply pending migrations
npm run migrate
```

Migration scripts use the same DB env vars as the app (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) and track state in `schema_migrations`.


### Roles and permissions foundation

A first authz foundation is now included:
- migration `db/migrations/0002_auth_foundation.sql` adds `users`, `roles`, `permissions`, `user_roles`, and `role_permissions`
- app-level auth context middleware derives identity/role from request headers
- inspection endpoint: `GET /api/auth/me`
- people write routes (`POST/PUT/DELETE /api/people`) are now guarded by `people:write`

Headers supported for local/dev simulation:
- `x-projectory-user-id`
- `x-projectory-user-email`
- `x-projectory-user-name`
- `x-projectory-user-role` (`admin`, `planner`, `viewer`)

Default role is `admin` (override with `AUTH_DEFAULT_ROLE`).




## Localization foundation

UI texts are now centralized via browser-side locale dictionaries and an i18n runtime:
- locale dictionaries: `public/js/locales/en.js`, `public/js/locales/de.js`
- i18n runtime: `public/js/i18n.js`
- language switcher in the top header (`en`/`de`) with persistence in `localStorage`

Translation keys are bound in two ways:
- static DOM binding via `data-i18n` / `data-i18n-title` attributes
- dynamic rendering via `window.ProjectoryI18n.t(key)` in inline view templates

See `docs/localization.md` for conventions and rollout guidance for translating additional UI sections.

## Developer docs

- Architecture overview: `docs/architecture.md`
- API authorization matrix: `docs/api-authz-matrix.md`
- Backend module template: `docs/module-template.md`
- Testing strategy: `docs/testing-strategy.md`
- Localization guide: `docs/localization.md`

## Continuous Integration

GitHub Actions workflow is available at `.github/workflows/ci.yml` and runs on pushes/PRs.

It executes:
- `npm run migrate` against a temporary Postgres service container
- `npm run check:syntax`
- `npm test`

## Useful commands

```bash

# Run syntax and smoke checks
npm run check:syntax
npm test
# Start in background
docker compose up -d --build

# Logs
docker compose logs -f

# Stop
docker compose down

# Stop + wipe database volume
docker compose down -v
```
