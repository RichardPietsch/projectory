# Contributing

Thanks for contributing to Projectory.

## Architecture-impacting changes (ADR required)

You must add/update an ADR under `docs/adr/` when your change impacts:

- **Auth**: session precedence, auth sources, role model, permission semantics, security controls
- **Data**: schema/migration strategy, compatibility guarantees, contract-critical persistence flows
- **Infra/Delivery**: container/runtime posture, CI policy gates, deployment/security scanning policy

Use `docs/adr/0000-template.md` and follow `docs/adr/README.md`.

## Boundary rules

Projectory uses domain module boundaries (`src/modules/<domain>/...`).

- Domain endpoints belong in module route files, not in `src/app.js`.
- Module `routes.js` files should orchestrate service/repo calls and avoid direct SQL (`pool.query(...)`) when a repo exists.
- Shared cross-cutting concerns remain in `src/app.js` (auth overlay, error handling helpers, middleware composition).

CI enforces ESLint static analysis (primary) plus boundary checks through `npm run lint:ci`.

## Pull request checklist

- [ ] Architecture impact evaluated; ADR added/updated if required
- [ ] Boundary rules respected
- [ ] `npm run lint:ci` passes
- [ ] `npm run test:architecture` passes (or is covered by `lint:ci`)
- [ ] `npm run check:syntax` passes
- [ ] `npm test` passes
