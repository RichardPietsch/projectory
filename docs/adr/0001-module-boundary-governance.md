# ADR 0001: Module boundary governance and CI boundary guard

- **Status:** accepted
- **Date:** 2026-03-06
- **Deciders:** Projectory maintainers

## Context

The codebase has moved key route families into domain modules, but without institutional guardrails it is easy for future changes to drift back into `src/app.js` or bypass service/repo boundaries.

## Decision

Adopt a lightweight architecture-governance process:

1. Require ADR updates for auth/data/infra-impacting changes.
2. Add CI lint checks that block:
   - modularized domain route families being reintroduced in `src/app.js`
   - direct SQL in module route files (`src/modules/*/routes.js`)
3. Document accepted/rejected boundary patterns in contributor and architecture docs.

## Alternatives considered

- **Do nothing (social convention only):** rejected due to high drift risk.
- **Full AST-based architecture linting:** deferred as too heavy for current repo size/complexity.

## Consequences

### Positive

- Preserves modular boundaries over time.
- Makes architecture-impacting choices auditable through ADR history.
- Fails fast in CI for common boundary regressions.

### Negative / trade-offs

- Regex-based checks are intentionally lightweight and may require occasional tuning.
- Contributors must perform small additional doc/ADR work for impactful changes.

## Boundary impact checklist

- [x] Auth boundary affected
- [x] Data boundary affected
- [x] Infra/CI boundary affected
- [ ] No boundary impact (explain why)

## Compatibility and rollout

- Backward compatibility expectations: no runtime API behavior changes from boundary-check enforcement alone.
- Migration/rollout plan: update docs and enable checks through existing `npm run lint:ci` invocation in CI.
- Rollback plan: revert lint boundary rules and ADR requirement docs if checks prove too noisy.

## Verification

- `npm run lint:ci`
- `npm run check:syntax`
- `npm test`

## Links

- PR: TBD
- Related ADRs: `0000-template.md`
- Related docs: `CONTRIBUTING.md`, `docs/architecture.md`, `README.md`
