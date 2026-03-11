# Architecture Overview

Projectory is implemented as a **modular monolith**:
- one deployable Node/Express service
- one Postgres database
- one static frontend served by the backend

## Backend layering

Each domain module follows this structure:

- `routes.js`: HTTP route definitions and transport-level concerns
- `service.js`: business rules and orchestration
- `repo.js`: SQL/data access only
- `schema.js`: payload validation and normalization

Current modules:
- `people`
- `clients`
- `onboarding`
- `projects`

## Composition model

`src/app.js` is responsible for:
- infrastructure bootstrap (Express, middleware, db pool)
- cross-cutting concerns (auth/session overlay, rate limiting, audit middleware, shared helpers)
- registering domain routes through `src/modules/index.js`
- non-domain portability/admin endpoints that are still centrally hosted

### App composition module map

As part of continued decomposition, `src/app.js` now orchestrates focused helpers under `src/app/`:

- `src/app/bootstrap.js`: startup orchestration (runtime validation, maintenance warmup, recurring cleanup scheduler, listener boot)
- `src/app/request-logging.js`: request logging diagnostics shaping (explicit header allowlist + minimal route-aware body summaries)
- `src/app/observability.js`: shared observability formatting helpers (metric path normalization, Prometheus label escaping, counter serialization)

`src/app.js` remains the entrypoint, but these modules establish stricter boundaries for future extraction of middleware stack, auth routes, admin/import-export routes, and additional observability surfaces.

## Architecture governance

- ADR history is stored in `docs/adr/`.
- Use `docs/adr/0000-template.md` and process guidance in `docs/adr/README.md`.
- ADRs are required for auth/data/infra-impacting design changes.
- Contribution expectations are documented in `CONTRIBUTING.md`.

## Boundary rules (enforced)

1. **No SQL in module route handlers** (`src/modules/*/routes.js`).
2. **No modularized domain routes in `src/app.js`** for people/clients/onboarding/projects/challenges/assignments families.
3. **Business rules belong in services**, transport concerns in routes, persistence in repos.
4. **Architecture-impacting changes require ADR updates**.

CI enforces lightweight checks with `npm run lint:ci`.

## Examples

### Accepted boundary usage

- Add a new endpoint in `src/modules/projects/routes.js`, call `projectsService`, and persist via `projectsRepo`.
- Add shared auth/session middleware in `src/app.js` and document the architectural rationale in an ADR.

### Rejected boundary usage

- Adding `app.post('/api/projects/...')` directly in `src/app.js` after module extraction.
- Calling `pool.query(...)` directly inside a module `routes.js` file when a repo layer exists.
- Changing auth precedence semantics without recording an ADR.

## Current technical debt (known)

- Import/export and some admin/configuration behavior still lives in `src/app.js` and can be extracted over time.
- `public/index.html` still contains large inline UI script; frontend modularization is ongoing.
