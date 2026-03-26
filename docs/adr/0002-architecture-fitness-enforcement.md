# 0002 - Architecture fitness enforcement for module layering

- Status: accepted
- Date: 2026-03-11
- Deciders: Projectory maintainers
- ADR: 0001-module-boundary-governance.md (extended)

## Context

Regex-only boundary checks were useful for early scaffolding, but they do not fully validate dependency direction between module layers (`routes`, `service`, `repo`, `schema`).

As the codebase grows, architectural drift can occur via cross-layer imports that still pass syntax checks.

## Decision

Adopt an enforceable architecture fitness test in CI via `scripts/architecture-fitness-check.js` and integrate it into unified lint workflow:

- `npm run lint:ci` remains the primary quality gate.
- `lint:boundaries` now runs both:
  - `scripts/ci-lint-check.js` (existing boundary/hygiene checks)
  - `scripts/architecture-fitness-check.js` (dependency fitness checks)

The fitness checks enforce:

1. No cross-module imports between `src/modules/<a>` and `src/modules/<b>` layer files.
2. Allowed same-module layer directions only:
   - `routes -> service|schema`
   - `service -> repo|schema`
   - `repo -> (no module layer imports)`
   - `schema -> (no module layer imports)`

Violations fail CI.

Temporary compatibility note:
- one legacy edge is allowlisted while decomposition continues: `src/modules/projects/routes.js -> src/modules/projects/repo.js`.
- this exception must be removed once projects route orchestration is fully moved behind service-layer adapters.

## Consequences

### Positive
- Dependency boundaries are validated deterministically and fail fast in CI.
- Module layering remains enforceable and reviewable over time.

### Trade-offs
- New module-level import patterns require intentional updates to the fitness policy.
- Developers may need to refactor helper placement to satisfy layer direction rules.

## Verification

- Local: `npm run test:architecture`
- CI gate: `npm run lint:ci`
