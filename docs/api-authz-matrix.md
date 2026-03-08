# API Authorization Matrix

This matrix documents the **implemented** authorization behavior in `src/app.js` + route modules,
including how header simulation and DB sessions are resolved.

## Auth context precedence (source of truth)

### Role model

Supported roles:
- `admin`
- `planner`
- `viewer`
- `teammate` (scoped collaborator)

Canonical permission mapping is defined in `src/auth/permissions.js`.

### Resolution order

Auth context is built in layers:

1. **Header-derived baseline context** from `attachAuthContext` (`src/auth/middleware.js`).
2. **Session overlay** middleware in `src/app.js`:
   - if a valid `projectory_session` cookie is present, DB session/user/role data overrides header simulation (`authSource: session`)
   - if `AUTH_MODE=session` and no valid session exists, request falls back to anonymous viewer context (`authSource: anonymous`)
   - otherwise baseline header context remains (`authSource: header`)
3. **Teammate scope enrichment**:
   - for teammate context, `scopedProjectIds` are resolved from persisted teammate project access and assignment/person linkage.

### Environment effects

- In **production**, `attachAuthContext` ignores injected user headers and defaults to viewer-safe behavior.
- `AUTH_MODE=session` is mandatory in production startup validation.

## Endpoint matrix

| Endpoint | Method | Permission gate | Implemented behavior notes |
|---|---|---:|---|
| `/api/auth/me` | GET | none | Returns resolved auth context (`authSource`, `authMode`, role/permissions, teammate scope). |
| `/api/auth/login` | POST | none | Creates DB-backed session cookie (`projectory_session`) on successful credential validation. |
| `/api/auth/logout` | POST | none | Revokes current DB session row and clears session cookie. |
| `/api/auth/forgot-password` | POST | none | Non-enumerating reset request endpoint; creates reset token and sends e-mail when SMTP is configured. |
| `/api/auth/reset-password` | POST | none | Consumes valid reset token and updates password hash. |
| `/api/auth/invite-preview` | POST | none | Invite-token lookup endpoint used before invite acceptance. |
| `/api/auth/accept-invite` | POST | none | Accepts invite, persists password, marks invite accepted. |
| `/api/meta` | GET | none | Returns priorities/trades/levels catalogs. |
| `/api/people` | GET | none | Open read endpoint. For scoped teammate context, response is **all non-hidden people** (assignment modal behavior), not project-filtered people only. |
| `/api/people` | POST | `people:write` | Enforced. |
| `/api/people/:id` | PUT | `people:write` | Enforced. |
| `/api/people/:id` | DELETE | `people:write` | Enforced. |
| `/api/clients` | GET | `clients:read` | Enforced. |
| `/api/clients` | POST | `clients:write` | Enforced. |
| `/api/clients/:id` | PUT | `clients:write` | Enforced. |
| `/api/clients/:id` | DELETE | `clients:write` | Enforced. |
| `/api/onboarding/profiles` | GET | none | Currently open read endpoint. |
| `/api/onboarding/profiles` | POST | `people:write` | Enforced. |
| `/api/onboarding/profiles/:id` | PUT | `people:write` | Enforced. |
| `/api/onboarding/profiles/:id` | DELETE | `people:write` | Enforced. |
| `/api/onboarding/profiles/:id/steps` | PUT | `people:write` | Enforced. |
| `/api/projects` | GET | `projects:read` | Enforced. For scoped teammate context, projects/challenges/assignments are API-filtered to `scopedProjectIds`. |
| `/api/projects` | POST | `projects:write` | Enforced; additionally blocked for scoped teammate context (`403`). |
| `/api/projects/:id` | PUT | `projects:write` | Enforced; additionally blocked for scoped teammate context (`403`). |
| `/api/projects/:id` | DELETE | `projects:write` | Enforced; additionally blocked for scoped teammate context (`403`). |
| `/api/projects/:projectId/challenges` | POST | `projects:write` | Enforced; teammate may mutate only in accessible project scope. |
| `/api/challenges/:id` | PUT | `projects:write` | Enforced; teammate scope-checked by challenge project. |
| `/api/challenges/:id` | DELETE | `projects:write` | Enforced; teammate scope-checked by challenge project. |
| `/api/assignments` | POST | `assignments:write` | Enforced; teammate scope-checked by project access. |
| `/api/assignments/:id` | PUT | `assignments:write` | Enforced; teammate scope-checked by assignment project. |
| `/api/projects/:projectId/people/:personId/quantity` | PUT | `assignments:write` | Enforced; teammate must be project-scoped **and** may update only own `personId`. |
| `/api/assignments/:id` | DELETE | `assignments:write` | Enforced; teammate scope-checked by assignment project. |
| `/api/export` | GET | `export:run` | Enforced (JSON or CSV). |
| `/api/export/config` | GET | `export:run` | Enforced (JSON or CSV). |
| `/api/import/preview` | POST | `import:run` | Enforced. |
| `/api/import/config/preview` | POST | `import:run` | Enforced. |
| `/api/import/config` | POST | `import:run` | Enforced. |
| `/api/import` | POST | `import:run` | Enforced. |
| `/api/admin/users` | GET | `admin:access` | Enforced. |
| `/api/admin/users` | POST | `admin:access` | Enforced. |
| `/api/admin/users/:id` | PUT | `admin:access` | Enforced. |
| `/api/admin/users/:id` | DELETE | `admin:access` | Enforced (self-delete guarded). |
| `/api/admin/users/:id/invite` | POST | `admin:access` | Enforced; invite row creation plus SMTP send attempt semantics. |
| `/api/admin/users/:id/invite/revoke` | POST | `admin:access` | Enforced. |
| `/api/admin/users/:id/project-access` | GET | `admin:access` | Enforced. |
| `/api/admin/users/:id/project-access` | PUT | `admin:access` | Enforced. |
| `/api/admin/smtp-settings` | GET | `admin:access` | Enforced. |
| `/api/admin/smtp-settings` | PUT | `admin:access` | Enforced. |
| `/api/admin/smtp-settings/test-email` | POST | `admin:access` | Enforced. |
| `/api/admin/audit` | GET | `admin:access` | Enforced. |
| `/api/configuration` | GET | `admin:access` | Enforced. |
| `/api/configuration` | PUT | `admin:access` | Enforced. |
| `/health` | GET | none | Healthcheck route. |

## Teammate behavior notes (current semantics)

- Teammate role has project/assignment write permissions but is constrained by runtime scope checks.
- `GET /api/projects` returns only teammate-scoped entities.
- Teammates cannot create/update/delete projects despite having `projects:write` in the role map; route-level guard blocks these operations.
- `PUT /api/projects/:projectId/people/:personId/quantity` allows teammates to edit quantity only for their own person record.
- `GET /api/people` intentionally returns full non-hidden people list for teammate assignment workflows.

## Docs validation checklist (auth + permission)

When auth behavior changes, update this document and validate claims against tests/code:

- [ ] **Auth precedence claims validated** by:
  - `test/auth-foundation.test.js`
    - `GET /api/auth/me supports role override headers`
    - `GET /api/auth/me ignores header simulation when AUTH_MODE=session without valid session cookie`
    - `production request handling ignores header simulation on /api/auth/me`
- [ ] **Teammate scope claims validated** by:
  - `test/app-smoke.test.js`
    - `GET /api/projects includes teammate assignment-scoped projects by person link`
    - `POST /api/projects forbids teammate role`
    - `PUT /api/projects/:projectId/people/:personId/quantity forbids teammate editing other person workload`
    - `GET /api/people returns full non-hidden list for teammate assignment modal`
- [ ] **Role permission model references** still match `src/auth/permissions.js` (`admin/planner/viewer/teammate`).
- [ ] **Endpoint rows added/updated** for any new `/api/*` route with explicit permission gate + teammate note where applicable.

## Traceability quick map

- Auth baseline context: `src/auth/middleware.js`
- Session overlay and mode fallback: `src/app.js` (session middleware and `buildSessionOnlyFallbackAuth` path)
- Teammate project/assignment scope checks: `src/app.js` (`canAccessProjectById`, teammate guards on project/challenge/assignment endpoints)
- Teammate people-list semantics: `src/modules/people/routes.js` (`GET /api/people` branch for `isScopedTeammate`)
