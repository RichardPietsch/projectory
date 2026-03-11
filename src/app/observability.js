function normalizeMetricPath(rawPath) {
  return String(rawPath || '/')
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,36}/gi, ':uuid');
}

function escapePrometheusLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function serializeCounterMetric(name, help, map, labelsBuilder) {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
  for (const [key, value] of map.entries()) {
    lines.push(`${name}{${labelsBuilder(key)}} ${value}`);
  }
  return lines.join('\n');
}

module.exports = {
  normalizeMetricPath,
  escapePrometheusLabel,
  serializeCounterMetric
};
