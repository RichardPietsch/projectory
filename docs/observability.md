# Observability Guide

Projectory exposes production-oriented health and metric endpoints for orchestrators and monitoring stacks.

## Structured request logging privacy defaults

- Request lifecycle logs preserve correlation IDs (`x-correlation-id`) and security telemetry while reducing privacy/log-volume risk.
- Incoming request headers are logged with an explicit allowlist only (`content-type`, `content-length`, `accept`, `x-correlation-id`).
- Request bodies are summarized via allowlisted diagnostics (for example hashed login e-mail identifiers and boolean presence flags) instead of full payload dumps.
- Secrets/tokens/passwords are never emitted as plaintext in request lifecycle logs.

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
- `projectory_rate_limit_hits_total{scope,outcome,method,path}`

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


## Endpoint abuse-control policy map

The following high-cost and mutable routes have explicit endpoint-level limiter policies (in addition to global request safeguards).

| Route class | Routes | Limiter scope key | Environment variables |
| --- | --- | --- | --- |
| Export payload generation | `GET /api/export`, `GET /api/export/:scope` | `export` | `EXPORT_RATE_LIMIT_MAX`, `EXPORT_RATE_LIMIT_WINDOW_MS` |
| Export configuration snapshot | `GET /api/export/config` | `export-config` | `EXPORT_CONFIG_RATE_LIMIT_MAX`, `EXPORT_CONFIG_RATE_LIMIT_WINDOW_MS` |
| Scoped import execution | `POST /api/import/:scope` | `import-scoped` | `IMPORT_RATE_LIMIT_MAX`, `IMPORT_RATE_LIMIT_WINDOW_MS` |
| Import previews (legacy + scoped) | `POST /api/import/preview`, `POST /api/import/config/preview`, `POST /api/import/:scope/preview` | `import-preview` | `IMPORT_PREVIEW_RATE_LIMIT_MAX`, `IMPORT_PREVIEW_RATE_LIMIT_WINDOW_MS` |
| Import configuration apply paths | `POST /api/import`, `POST /api/import/config` | `import-config` | `IMPORT_CONFIG_RATE_LIMIT_MAX`, `IMPORT_CONFIG_RATE_LIMIT_WINDOW_MS` |
| Admin audit queries | `GET /api/admin/audit` | `admin-audit` | `ADMIN_AUDIT_RATE_LIMIT_MAX`, `ADMIN_AUDIT_RATE_LIMIT_WINDOW_MS` |
| Admin configuration read | `GET /api/configuration` | `admin-configuration` | `ADMIN_CONFIGURATION_RATE_LIMIT_MAX`, `ADMIN_CONFIGURATION_RATE_LIMIT_WINDOW_MS` |
| Admin configuration writes | `PUT /api/configuration` | `admin-configuration-mutation` | `ADMIN_CONFIGURATION_MUTATION_RATE_LIMIT_MAX`, `ADMIN_CONFIGURATION_MUTATION_RATE_LIMIT_WINDOW_MS` |
| Project/challenge mutations | `POST/PUT/DELETE /api/projects*`, `POST /api/projects/:projectId/challenges`, `PUT/DELETE /api/challenges/:id` | `projects-mutation` | `PROJECTS_MUTATION_RATE_LIMIT_MAX`, `PROJECTS_MUTATION_RATE_LIMIT_WINDOW_MS` |
| Assignment mutations | `POST/PUT/DELETE /api/assignments*`, `PUT /api/projects/:projectId/people/:personId/quantity` | `assignments-mutation` | `ASSIGNMENTS_MUTATION_RATE_LIMIT_MAX`, `ASSIGNMENTS_MUTATION_RATE_LIMIT_WINDOW_MS` |

Notes:
- Existing `admin` user-management limiter behavior is intentionally unchanged.
- The metrics stream emits `projectory_rate_limit_hits_total` whenever a limiter blocks with HTTP 429.
