# API Authorization Matrix

This matrix documents intended permission requirements per endpoint.

## Auth context

Auth context is derived from request headers in `src/auth/middleware.js`.

Supported roles:
- `admin`
- `planner`
- `viewer`

## Matrix

| Endpoint | Method | Permission | Notes |
|---|---|---:|---|
| `/api/auth/me` | GET | none | debug/introspection |
| `/api/meta` | GET | none | catalog data |
| `/api/people` | GET | none | currently open |
| `/api/people` | POST | `people:write` | enforced |
| `/api/people/:id` | PUT | `people:write` | enforced |
| `/api/people/:id` | DELETE | `people:write` | enforced |
| `/api/clients` | GET | none | currently open |
| `/api/clients` | POST | none | currently open (candidate for `clients:write`) |
| `/api/clients/:id` | PUT | none | currently open (candidate for `clients:write`) |
| `/api/clients/:id` | DELETE | none | currently open (candidate for `clients:write`) |
| `/api/onboarding/profiles` | GET | none | currently open |
| `/api/onboarding/profiles` | POST | `people:write` | enforced |
| `/api/onboarding/profiles/:id` | PUT | `people:write` | enforced |
| `/api/onboarding/profiles/:id` | DELETE | `people:write` | enforced |
| `/api/onboarding/profiles/:id/steps` | PUT | `people:write` | enforced |
| `/api/projects` | GET | none | legacy route in app.js |
| `/api/projects` | POST | none | legacy route in app.js |
| `/api/projects/:id` | PUT | none | legacy route in app.js |
| `/api/projects/:id` | DELETE | none | legacy route in app.js |
| `/api/challenges/:id` | PUT | none | legacy route in app.js |
| `/api/challenges/:id` | DELETE | none | legacy route in app.js |
| `/api/assignments` | POST | none | legacy route in app.js |
| `/api/assignments/:id` | PUT | none | legacy route in app.js |
| `/api/assignments/:id` | DELETE | none | legacy route in app.js |
| `/api/import/preview` | POST | none | candidate for `import:run` |
| `/api/import` | POST | none | candidate for `import:run` |
| `/api/export` | GET | none | candidate for `export:run` |
| `/health` | GET | none | healthcheck |

## Recommended immediate follow-up

- enforce `clients:write` on client write routes
- enforce `projects:write` and `assignments:write` on legacy write routes
- enforce `import:run` / `export:run` for data movement endpoints
