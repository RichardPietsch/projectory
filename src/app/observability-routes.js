function registerObservabilityRoutes({ app, pool, renderPrometheusMetrics }) {
  app.get('/health/live', (_req, res) => {
    res.json({ status: 'alive', uptimeSeconds: Math.floor(process.uptime()) });
  });

  async function sendReadiness(res) {
    try {
      const startedAt = Date.now();
      await pool.query('SELECT 1');
      return res.json({ status: 'ready', db: 'ok', dbLatencyMs: Date.now() - startedAt });
    } catch (_error) {
      return res.status(503).json({ status: 'not_ready', db: 'down' });
    }
  }

  app.get('/health/ready', async (_req, res) => sendReadiness(res));
  app.get('/health', async (_req, res) => sendReadiness(res));

  app.get('/metrics', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return res.send(renderPrometheusMetrics());
  });
}

module.exports = { registerObservabilityRoutes };
