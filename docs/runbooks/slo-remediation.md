# SLO Remediation Runbook

Use this runbook when SLO alerts fire.

## Availability SLO

1. Check `/health/ready` for DB readiness failures.
2. Verify app instance restarts/crash loops and recent deploy rollouts.
3. Validate DB connectivity and credential/secret configuration.
4. If deployment-caused, rollback to last known good release.

## Error-rate SLO

1. Check `projectory_http_request_errors_total` by `path`/`method` to isolate failing endpoints.
2. Inspect correlated `request.error` logs using `x-correlation-id`.
3. For auth/admin spikes, verify active throttling and abuse patterns.
4. Mitigate with rollback or temporary feature flag disablement.

## Latency SLO

1. Identify top slow paths from request duration histograms.
2. Correlate with DB latency (`projectory_db_query_duration_ms_*`).
3. Check recent migrations, index changes, and high-cardinality workloads.
4. Scale app/DB resources and optimize hotspot queries.

## DB health SLO

1. Inspect DB query errors and p95 query latency trends.
2. Check Postgres saturation (CPU, locks, connections, I/O).
3. Verify migration status and schema compatibility.
4. If needed, fail over / rollback app release and run hotfix migration.

## Release gate tie-in

No release promotion should proceed while page-severity SLO alerts are firing or while SLO artifacts are missing/invalid in-repo.
