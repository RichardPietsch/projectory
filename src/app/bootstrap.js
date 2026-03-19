async function startServerRuntime({
  validateAuthRuntimeSafety,
  validateRuntimeEnvironment,
  cleanupAuditLogRetention,
  cleanupAuthLifecycleArtifacts,
  incrementCleanupFailure,
  cleanupIntervalMs,
  app,
  port,
  logger = console
}) {
  validateAuthRuntimeSafety();
  validateRuntimeEnvironment();

  try {
    await cleanupAuditLogRetention();
  } catch (error) {
    logger.warn('Startup readiness validation skipped optional maintenance.', error.message);
  }

  try {
    await cleanupAuthLifecycleArtifacts();
  } catch (error) {
    incrementCleanupFailure();
    logger.warn('Startup auth lifecycle cleanup failed.', error.message);
  }

  const intervalMs = Number.isFinite(cleanupIntervalMs) && cleanupIntervalMs > 0
    ? cleanupIntervalMs
    : 15 * 60 * 1000;

  const cleanupInterval = setInterval(async () => {
    try {
      await cleanupAuthLifecycleArtifacts();
    } catch (error) {
      incrementCleanupFailure();
      logger.warn('Scheduled auth lifecycle cleanup failed.', error.message);
    }
  }, intervalMs);
  cleanupInterval.unref();

  app.listen(port, () => {
    logger.log(`Projectory app listening on port ${port}`);
  });
}

module.exports = {
  startServerRuntime
};
