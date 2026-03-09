# Architecture Decision Records (ADRs)

This folder stores durable architecture decisions so teams can trace *why* major choices were made.

## When an ADR is required

Create an ADR for any change that materially impacts:

1. **Auth** (identity sources, session precedence, permission model, role semantics, security controls)
2. **Data** (schema shape, migration strategy, consistency guarantees, contract-critical persistence behavior)
3. **Infra/Delivery** (runtime/container posture, CI policy gates, deployment architecture, security scanning policy)

If a PR changes one of the above and no ADR is included/updated, the PR is incomplete.

## Naming and lifecycle

- Use `NNNN-short-kebab-title.md`.
- Start with `0000-template.md` for structure.
- ADR status values:
  - `proposed`
  - `accepted`
  - `superseded` (include link to replacement ADR)
  - `rejected`

## Required PR linkage

Every architecture-impacting PR should include:

- `ADR:` reference(s) in the PR body (new or updated ADR files)
- short summary of boundary impact in the PR description
- test/check evidence for the changed boundary behavior

## Examples of accepted/rejected boundary changes

### Accepted (with ADR)

- Move route family from `src/app.js` to `src/modules/<domain>/routes.js` and move SQL into `repo.js`.
- Add session-first auth precedence and document fallback mode semantics.
- Add CI boundary gate that blocks direct DB calls from domain route files.

### Rejected (without explicit ADR and migration plan)

- Add new auth source precedence behavior directly in middleware without ADR.
- Introduce schema-breaking migration without documenting compatibility/rollback strategy.
- Bypass module boundaries by adding domain routes back to `src/app.js` for convenience.
