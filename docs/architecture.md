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

## Composition model

`src/app.js` is responsible for:
- infrastructure bootstrap (Express, middleware, db pool)
- registering all domain routes through `src/modules/index.js`
- hosting remaining legacy routes (projects/challenges/assignments/import/export)

## Rule of thumb for contributors

1. **No SQL in route handlers** (place SQL in `repo.js`).
2. **No business logic in controllers/routes** (place in `service.js`).
3. **Validate at module boundary** using module schema helpers.
4. **Add/update tests** for each behavior change.
5. **Register new modules centrally** in `src/modules/index.js`.

## Current technical debt (known)

- `src/app.js` still contains legacy non-modular routes and import/export logic.
- `public/index.html` still contains large inline UI script; modularization is in progress.

## Next intended decomposition targets

- projects module
- challenges module
- assignments module
- import/export module
