# Baseline SLO/SLI Definition

## SLO targets

- **Availability SLO:** 99.5% monthly (`up{job="projectory"}` as baseline SLI)
- **Latency SLO:** p95 HTTP latency < 750ms (5m rolling windows)
- **Error-rate SLO:** HTTP 5xx ratio < 1% (5m rolling windows)
- **DB health SLO:**
  - DB query errors: zero sustained increases over 5m
  - DB query p95 latency < 250ms (5m rolling windows)

## SLI source metrics

- `projectory_http_requests_total`
- `projectory_http_request_errors_total`
- `projectory_http_request_duration_ms_bucket`
- `projectory_db_query_errors_total`
- `projectory_db_query_duration_ms_bucket`
- `up{job="projectory"}`

## Versioned readiness artifacts

- Prometheus alert rules: `ops/alerts/projectory-slo-alerts.yml`
- Grafana dashboard: `ops/dashboards/projectory-slo-dashboard.json`
- Runbook: `docs/runbooks/slo-remediation.md`

These artifacts are validated by `npm run ops:readiness-check` and included in release readiness gates.

## Release go/no-go tie-in

Public rollout is blocked unless `docs/release-readiness-checklist.md` is fully satisfied and validated by `npm run release:readiness-check` in CI.

