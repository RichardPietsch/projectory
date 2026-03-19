function createMetricsRuntime({
  metricsState,
  metricDurationBucketsMs,
  escapePrometheusLabel,
  serializeCounterMetric
}) {
  function incrementCounter(map, key, value = 1) {
    map.set(key, (map.get(key) || 0) + value);
  }

  function observeDurationBuckets(map, keyPrefix, durationMs) {
    const prefix = keyPrefix ? `${keyPrefix}|` : '';
    for (const bucket of metricDurationBucketsMs) {
      if (durationMs <= bucket) {
        incrementCounter(map, `${prefix}le=${bucket}`);
      }
    }
    incrementCounter(map, `${prefix}le=+Inf`);
  }

  function clearMetrics() {
    for (const key of Object.keys(metricsState)) {
      if (metricsState[key] instanceof Map) {
        metricsState[key].clear();
      } else {
        metricsState[key] = 0;
      }
    }
  }

  function renderPrometheusMetrics() {
    const sections = [];

    sections.push(serializeCounterMetric(
      'projectory_http_requests_total',
      'Total HTTP requests handled.',
      metricsState.requestsTotal,
      (key) => {
        const [method, path, status] = key.split('|');
        return `method="${escapePrometheusLabel(method)}",path="${escapePrometheusLabel(path)}",status="${escapePrometheusLabel(status)}"`;
      }
    ));

    sections.push(serializeCounterMetric(
      'projectory_http_request_errors_total',
      'HTTP 5xx responses.',
      metricsState.requestErrorsTotal,
      (key) => {
        const [method, path] = key.split('|');
        return `method="${escapePrometheusLabel(method)}",path="${escapePrometheusLabel(path)}"`;
      }
    ));

    const reqDuration = ['# HELP projectory_http_request_duration_ms HTTP request duration in milliseconds.', '# TYPE projectory_http_request_duration_ms histogram'];
    for (const [key, value] of metricsState.requestDurationBuckets.entries()) {
      const [method, path, le] = key.split('|');
      reqDuration.push(`projectory_http_request_duration_ms_bucket{method="${escapePrometheusLabel(method)}",path="${escapePrometheusLabel(path)}",le="${escapePrometheusLabel(le.replace('le=', ''))}"} ${value}`);
    }
    for (const [key, value] of metricsState.requestDurationCount.entries()) {
      const [method, path] = key.split('|');
      reqDuration.push(`projectory_http_request_duration_ms_count{method="${escapePrometheusLabel(method)}",path="${escapePrometheusLabel(path)}"} ${value}`);
      reqDuration.push(`projectory_http_request_duration_ms_sum{method="${escapePrometheusLabel(method)}",path="${escapePrometheusLabel(path)}"} ${metricsState.requestDurationSumMs.get(key) || 0}`);
    }
    sections.push(reqDuration.join('\n'));

    sections.push(serializeCounterMetric(
      'projectory_auth_failures_total',
      'Authentication failure/security events by type.',
      metricsState.authFailuresTotal,
      (key) => `type="${escapePrometheusLabel(key)}"`
    ));

    sections.push(serializeCounterMetric(
      'projectory_rate_limit_hits_total',
      'Rate-limit events by policy scope and outcome.',
      metricsState.rateLimitHitsTotal,
      (key) => {
        const [scope, outcome, method, path] = key.split('|');
        return `scope="${escapePrometheusLabel(scope)}",outcome="${escapePrometheusLabel(outcome)}",method="${escapePrometheusLabel(method)}",path="${escapePrometheusLabel(path)}"`;
      }
    ));

    const dbDuration = ['# HELP projectory_db_query_duration_ms Database query duration in milliseconds.', '# TYPE projectory_db_query_duration_ms histogram'];
    for (const [key, value] of metricsState.dbQueryDurationBuckets.entries()) {
      dbDuration.push(`projectory_db_query_duration_ms_bucket{le="${escapePrometheusLabel(key.replace('le=', ''))}"} ${value}`);
    }
    dbDuration.push(`projectory_db_query_duration_ms_count ${metricsState.dbQueryDurationCount}`);
    dbDuration.push(`projectory_db_query_duration_ms_sum ${metricsState.dbQueryDurationSumMs}`);
    sections.push(dbDuration.join('\n'));

    sections.push(`# HELP projectory_db_query_errors_total Database query failures.\n# TYPE projectory_db_query_errors_total counter\nprojectory_db_query_errors_total ${metricsState.dbQueryErrorsTotal}`);

    sections.push(serializeCounterMetric(
      'projectory_auth_lifecycle_cleanup_runs_total',
      'Auth lifecycle cleanup runs by outcome.',
      metricsState.authLifecycleCleanupRunsTotal,
      (key) => `outcome="${escapePrometheusLabel(key)}"`
    ));

    sections.push(serializeCounterMetric(
      'projectory_auth_lifecycle_cleanup_deleted_rows_total',
      'Rows deleted by auth lifecycle cleanup, partitioned by artifact kind.',
      metricsState.authLifecycleCleanupDeletedRowsTotal,
      (key) => `kind="${escapePrometheusLabel(key)}"`
    ));

    return sections.join('\n\n') + '\n';
  }

  return {
    incrementCounter,
    observeDurationBuckets,
    clearMetrics,
    renderPrometheusMetrics
  };
}

module.exports = {
  createMetricsRuntime
};
