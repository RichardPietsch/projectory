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
| `/api/clients` | GET | `clients:read` | enforced |
| `/api/clients` | POST | `clients:write` | enforced |
| `/api/clients/:id` | PUT | `clients:write` | enforced |
| `/api/clients/:id` | DELETE | `clients:write` | enforced |
| `/api/onboarding/profiles` | GET | none | currently open |
| `/api/onboarding/profiles` | POST | `people:write` | enforced |
| `/api/onboarding/profiles/:id` | PUT | `people:write` | enforced |
| `/api/onboarding/profiles/:id` | DELETE | `people:write` | enforced |
| `/api/onboarding/profiles/:id/steps` | PUT | `people:write` | enforced |
| `/api/projects` | GET | `projects:read` | enforced (legacy route in app.js) |
| `/api/projects` | POST | `projects:write` | enforced (legacy route in app.js) |
| `/api/projects/:id` | PUT | `projects:write` | enforced (legacy route in app.js) |
| `/api/projects/:id` | DELETE | `projects:write` | enforced (legacy route in app.js) |
| `/api/challenges/:id` | PUT | `projects:write` | enforced (legacy route in app.js) |
| `/api/challenges/:id` | DELETE | `projects:write` | enforced (legacy route in app.js) |
| `/api/assignments` | POST | `assignments:write` | enforced (legacy route in app.js) |
| `/api/assignments/:id` | PUT | `assignments:write` | enforced (legacy route in app.js) |
| `/api/assignments/:id` | DELETE | `assignments:write` | enforced (legacy route in app.js) |
| `/api/import/preview` | POST | `import:run` | enforced |
| `/api/import` | POST | `import:run` | enforced |
| `/api/export` | GET | `export:run` | enforced |
| `/health` | GET | none | healthcheck |

## Recommended immediate follow-up

- permission baseline extended to clients/projects/assignments/import/export routes
- remaining follow-up: align onboarding read and other legacy reads with explicit policy where needed
