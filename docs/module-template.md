# Module Template

Use this template when introducing a new backend domain module.

## File layout

```
src/modules/<domain>/
  routes.js
  service.js
  repo.js
  schema.js
```

## Responsibilities

- **routes**: parse request, call service, map HTTP responses
- **service**: business rules
- **repo**: SQL only
- **schema**: validation/normalization

## Registration

1. Add module registration in `src/modules/index.js`.
2. Pass shared dependencies through the registration context (`pool`, `badRequest`, `handleDbError`, etc).

## Testing checklist

- validation failure path
- success path
- authz path (for protected endpoints)
- not-found path (if applicable)
