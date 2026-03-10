# Observability Guide

Projectory exposes production-oriented health and metric endpoints for orchestrators and monitoring stacks.

## Health endpoints

### `GET /health/live`

**Purpose:** liveness probe.

- Returns `200` when the process is running.
- Does **not** require DB availability.
- Intended for container restart decisions.

Example response:

```json
{
  "status": "alive",
  "uptimeSeconds": 1234
}
```

### `GET /health/ready`

**Purpose:** readiness probe.

- Returns `200` when app can serve traffic and DB connectivity check succeeds.
- Returns `503` when DB connectivity fails.
- Intended for load balancer / orchestrator traffic gating.

Ready response:

```json
{
  "status": "ready",
  "db": "ok",
  "dbLatencyMs": 3
}
```

Not-ready response:

```json
{
  "status": "not_ready",
  "db": "down"
}
```

### `GET /health`

Backward-compatible alias to readiness semantics (`/health/ready`).

## Metrics endpoint

### `GET /metrics`

Prometheus text format endpoint with core golden-signal and auth/DB diagnostics:

- `projectory_http_requests_total{method,path,status}`
- `projectory_http_request_duration_ms_*` (histogram)
- `projectory_http_request_errors_total{method,path}` (5xx responses)
- `projectory_auth_failures_total{type}`
- `projectory_db_query_duration_ms_*` (histogram)
- `projectory_db_query_errors_total`

## Baseline alerting thresholds

These are starter thresholds and should be tuned per environment/SLOs.

1. **Readiness failing**
   - Alert when `/health/ready` is failing for `>= 2m`.
2. **High 5xx error rate**
   - Alert when `sum(rate(projectory_http_request_errors_total[5m])) / sum(rate(projectory_http_requests_total[5m])) > 0.05` for `>= 10m`.
3. **High latency (p95)**
   - Alert when p95 request latency exceeds `750ms` for `>= 10m`.
4. **DB instability**
   - Alert when `increase(projectory_db_query_errors_total[5m]) > 0` in production.
5. **Auth attack signal**
   - Alert when `increase(projectory_auth_failures_total[5m])` breaches environment-specific baseline (e.g. >100/5m).

## Dashboard guidance (golden signals)

Minimum dashboard panels:

1. **Traffic**: request rate by path/status.
2. **Latency**: p50/p95/p99 request latency by critical API paths.
3. **Errors**: 5xx rate and absolute error counts.
4. **Saturation/Dependencies**: DB query latency + DB query error counts.
5. **Security posture**: auth failure/throttle events by type.

Recommended filters/groupings:

- `path` (normalized endpoint path labels)
- `status`
- `method`
- environment / deployment version labels from the scrape target
