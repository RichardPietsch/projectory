# Testing Strategy

Projectory uses a layered testing approach.

## 1) Fast local checks

- `npm run check:syntax`
- `npm test`

These run quickly and should pass before every commit.

## 2) Test layers

### Smoke/API tests
Located in `test/app-smoke.test.js` and `test/auth-foundation.test.js`.

Purpose:
- verify endpoint contracts and auth behavior
- ensure key happy/error paths remain stable

### Unit tests (schema/service utilities)
Examples:
- `test/people-schema.test.js`
- `test/onboarding-schema.test.js`

Purpose:
- validate normalization and payload rules without network/DB requirements

### DB integration tests (opt-in)
`test/db-integration.test.js` is guarded by environment variable:
- run with `RUN_DB_INTEGRATION=1 npm test`

Purpose:
- verify assumptions against a real Postgres instance (e.g., migration artifacts)

## 3) Test data builders

Use payload builders from `test-utils/builders.js` to:
- keep tests concise
- reduce duplication
- standardize payload shapes

## 4) CI expectations

CI runs migrations, syntax checks, and tests. Keep tests deterministic and network-independent.
