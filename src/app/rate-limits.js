function createRateLimitRuntime({ pool, expressRateLimit, env }) {
  const requestRateBuckets = new Map();
  const routeRateLimitBuckets = new Map();
  const RATE_LIMIT_BUCKET_SWEEP_INTERVAL_MS = 30000;
  const RATE_LIMIT_DISTRIBUTED_CLEANUP_INTERVAL_MS = 60000;
  const RATE_LIMIT_DISTRIBUTED_RETENTION_MS = Number(env.RATE_LIMIT_DISTRIBUTED_RETENTION_MS || 15 * 60 * 1000);
  let lastRateLimitBucketSweepAt = 0;
  let lastDistributedRateLimitCleanupAt = 0;

  function clearRequestRateLimitBuckets() {
    requestRateBuckets.clear();
    routeRateLimitBuckets.clear();
    lastRateLimitBucketSweepAt = 0;
  }

  function sweepExpiredRateLimitBuckets(now, windowMs) {
    if (now - lastRateLimitBucketSweepAt < RATE_LIMIT_BUCKET_SWEEP_INTERVAL_MS) return;
    for (const [ipKey, bucket] of requestRateBuckets.entries()) {
      if (now - bucket.windowStart >= windowMs) requestRateBuckets.delete(ipKey);
    }
    lastRateLimitBucketSweepAt = now;
  }

  function consumeLocalRateLimitBucket(buckets, bucketKey, windowMs, max) {
    const now = Date.now();
    const bucket = buckets.get(bucketKey);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      buckets.set(bucketKey, { windowStart: now, count: 1 });
      return { allowed: true, retryAfterMs: 0 };
    }
    bucket.count += 1;
    if (bucket.count > max) return { allowed: false, retryAfterMs: Math.max(1, windowMs - (now - bucket.windowStart)) };
    return { allowed: true, retryAfterMs: 0 };
  }

  async function maybeCleanupDistributedRateLimitBuckets(nowMs) {
    if (nowMs - lastDistributedRateLimitCleanupAt < RATE_LIMIT_DISTRIBUTED_CLEANUP_INTERVAL_MS) return;
    lastDistributedRateLimitCleanupAt = nowMs;
    const retentionMs = Math.max(RATE_LIMIT_DISTRIBUTED_RETENTION_MS, RATE_LIMIT_BUCKET_SWEEP_INTERVAL_MS);
    await pool.query(
      `DELETE FROM rate_limit_buckets
       WHERE updated_at < NOW() - (($1::numeric / 1000.0) * INTERVAL '1 second')`,
      [retentionMs]
    );
  }

  async function consumeDistributedRateLimitBucket(scope, actorKey, windowMs, max, fallbackBuckets) {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    try {
      const result = await pool.query(
        `INSERT INTO rate_limit_buckets (scope, actor_key, window_start, count, updated_at)
         VALUES ($1, $2, $3::timestamptz, 1, NOW())
         ON CONFLICT (scope, actor_key)
         DO UPDATE SET
           count = CASE
             WHEN (($3::timestamptz - rate_limit_buckets.window_start) >= (($4::numeric / 1000.0) * INTERVAL '1 second')) THEN 1
             ELSE rate_limit_buckets.count + 1
           END,
           window_start = CASE
             WHEN (($3::timestamptz - rate_limit_buckets.window_start) >= (($4::numeric / 1000.0) * INTERVAL '1 second')) THEN $3::timestamptz
             ELSE rate_limit_buckets.window_start
           END,
           updated_at = NOW()
         RETURNING count, EXTRACT(EPOCH FROM window_start) * 1000 AS window_start_ms`,
        [scope, actorKey, nowIso, windowMs]
      );
      const row = result?.rows?.[0];
      if (!row) return consumeLocalRateLimitBucket(fallbackBuckets, `${scope}|${actorKey}`, windowMs, max);
      await maybeCleanupDistributedRateLimitBuckets(nowMs);
      const count = Number(row.count);
      const windowStartMs = Number(row.window_start_ms);
      if (!Number.isFinite(count) || !Number.isFinite(windowStartMs)) {
        return consumeLocalRateLimitBucket(fallbackBuckets, `${scope}|${actorKey}`, windowMs, max);
      }
      if (count > max) return { allowed: false, retryAfterMs: Math.max(1, windowMs - (nowMs - windowStartMs)) };
      return { allowed: true, retryAfterMs: 0 };
    } catch (_error) {
      return consumeLocalRateLimitBucket(fallbackBuckets, `${scope}|${actorKey}`, windowMs, max);
    }
  }

  function toRetryAfterSeconds(retryAfterMs) {
    const seconds = Math.ceil(Math.max(0, Number(retryAfterMs) || 0) / 1000);
    return seconds > 0 ? seconds : 1;
  }

  function getRateLimitConfig() {
    const isProduction = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
    const defaultMax = isProduction ? 120 : 10000;
    const max = Number(env.REQUEST_RATE_LIMIT_MAX || defaultMax);
    const windowMs = Number(env.REQUEST_RATE_LIMIT_WINDOW_MS || 60000);
    return {
      max: Number.isFinite(max) && max > 0 ? max : defaultMax,
      windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60000
    };
  }

  function rateLimit(config = {}) {
    const windowMs = Number(config.windowMs || 60000);
    const max = Number(config.max || 60);
    const keyPrefix = String(config.keyPrefix || 'route').trim() || 'route';
    const message = String(config.message || 'Too many requests.');
    const keyGenerator = typeof config.keyGenerator === 'function'
      ? config.keyGenerator
      : (req) => String(req.ip || req.socket?.remoteAddress || 'unknown');

    return async (req, res, next) => {
      try {
        const actorKey = String(keyGenerator(req) || 'unknown');
        const rateState = await consumeDistributedRateLimitBucket(
          keyPrefix,
          actorKey,
          windowMs,
          max,
          routeRateLimitBuckets
        );

        if (!rateState.allowed) {
          res.setHeader('Retry-After', String(toRetryAfterSeconds(rateState.retryAfterMs)));
          return res.status(429).json({ error: message });
        }

        return next();
      } catch (error) {
        return next(error);
      }
    };
  }

  async function requestRateLimitMiddleware(req, res, next) {
    const { max, windowMs } = getRateLimitConfig();
    const ipKey = String(req.ip || req.socket?.remoteAddress || 'unknown');

    try {
      sweepExpiredRateLimitBuckets(Date.now(), windowMs);
      const rateState = await consumeDistributedRateLimitBucket('request-global', ipKey, windowMs, max, requestRateBuckets);
      if (!rateState.allowed) {
        res.setHeader('Retry-After', String(toRetryAfterSeconds(rateState.retryAfterMs)));
        return res.status(429).json({ error: 'Too many requests.' });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  }

  const appWideDoSRateLimitMiddleware = rateLimit({
    keyPrefix: 'app-dos-global',
    max: Number(env.APP_DOS_RATE_LIMIT_MAX || 120),
    windowMs: Number(env.APP_DOS_RATE_LIMIT_WINDOW_MS || 60000),
    message: 'Too many requests.'
  });
  const forgotPasswordRouteRateLimitMiddleware = rateLimit({ keyPrefix: 'auth-forgot-password', max: Number(env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX || 10), windowMs: Number(env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS || 60000), message: 'Too many password reset requests. Please wait before trying again.', keyGenerator: (req) => `${String(req.ip || req.socket?.remoteAddress || 'unknown')}|${String(req.body?.email || '').trim().toLowerCase() || 'unknown'}` });
  const loginRouteRateLimitMiddleware = rateLimit({ keyPrefix: 'auth-login', max: Number(env.AUTH_LOGIN_RATE_LIMIT_MAX || 30), windowMs: Number(env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS || 60000), message: 'Too many login attempts. Please wait before trying again.' });
  const registerInitialAdminRouteRateLimitMiddleware = rateLimit({ keyPrefix: 'auth-register-initial-admin', max: Number(env.AUTH_REGISTER_INITIAL_ADMIN_RATE_LIMIT_MAX || 5), windowMs: Number(env.AUTH_REGISTER_INITIAL_ADMIN_RATE_LIMIT_WINDOW_MS || 60000), message: 'Too many initial admin registration attempts. Please wait before trying again.' });
  const bootstrapStatusRouteRateLimitMiddleware = rateLimit({ keyPrefix: 'auth-bootstrap-status', max: Number(env.AUTH_BOOTSTRAP_STATUS_RATE_LIMIT_MAX || 60), windowMs: Number(env.AUTH_BOOTSTRAP_STATUS_RATE_LIMIT_WINDOW_MS || 60000), message: 'Too many bootstrap status requests. Please wait before trying again.' });
  const configurationRouteRateLimitMiddleware = rateLimit({ keyPrefix: 'admin-configuration', max: Number(env.ADMIN_CONFIGURATION_RATE_LIMIT_MAX || 60), windowMs: Number(env.ADMIN_CONFIGURATION_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000), message: 'Too many configuration requests. Please wait before trying again.' });
  const metaRouteRateLimitMiddleware = rateLimit({ keyPrefix: 'meta', max: Number(env.META_RATE_LIMIT_MAX || 120), windowMs: Number(env.META_RATE_LIMIT_WINDOW_MS || 60000), message: 'Too many metadata requests. Please wait before trying again.' });
  const exportConfigRouteRateLimitMiddleware = rateLimit({ keyPrefix: 'export-config', max: Number(env.EXPORT_CONFIG_RATE_LIMIT_MAX || 30), windowMs: Number(env.EXPORT_CONFIG_RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000), message: 'Too many configuration export requests. Please wait before trying again.' });
  const exportRouteRateLimitMiddleware = rateLimit({ keyPrefix: 'export', max: Number(env.EXPORT_RATE_LIMIT_MAX || 20), windowMs: Number(env.EXPORT_RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000), message: 'Too many export requests. Please wait before trying again.' });
  const importRouteRateLimitMiddleware = rateLimit({ keyPrefix: 'import-scoped', max: Number(env.IMPORT_RATE_LIMIT_MAX || 3), windowMs: Number(env.IMPORT_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000), message: 'Too many import requests. Please wait before trying again.', keyGenerator: (req) => `${String(req.ip || req.socket?.remoteAddress || 'unknown')}|${String(req.auth?.userId || req.auth?.email || 'anonymous').trim().toLowerCase() || 'anonymous'}|${String(req.params?.scope || 'unknown').trim().toLowerCase()}` });
  const adminAuditRouteRateLimitMiddleware = rateLimit({ keyPrefix: 'admin-audit', max: Number(env.ADMIN_AUDIT_RATE_LIMIT_MAX || 30), windowMs: Number(env.ADMIN_AUDIT_RATE_LIMIT_WINDOW_MS || 60 * 1000), message: 'Too many audit log requests. Please wait before trying again.' });
  const adminUserManagementRouteRateLimitMiddleware = expressRateLimit({ windowMs: Number(env.ADMIN_USER_MANAGEMENT_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000), max: Number(env.ADMIN_USER_MANAGEMENT_RATE_LIMIT_MAX || 60), standardHeaders: true, legacyHeaders: false, message: { error: 'Too many admin user management requests. Please wait before trying again.' } });
  const spaShellRouteRateLimitMiddleware = rateLimit({ keyPrefix: 'spa-shell', max: Number(env.SPA_SHELL_RATE_LIMIT_MAX || 240), windowMs: Number(env.SPA_SHELL_RATE_LIMIT_WINDOW_MS || 60000), message: 'Too many page requests. Please slow down.' });

  return {
    clearRequestRateLimitBuckets,
    requestRateLimitMiddleware,
    appWideDoSRateLimitMiddleware,
    forgotPasswordRouteRateLimitMiddleware,
    loginRouteRateLimitMiddleware,
    registerInitialAdminRouteRateLimitMiddleware,
    bootstrapStatusRouteRateLimitMiddleware,
    configurationRouteRateLimitMiddleware,
    metaRouteRateLimitMiddleware,
    exportConfigRouteRateLimitMiddleware,
    exportRouteRateLimitMiddleware,
    importRouteRateLimitMiddleware,
    adminAuditRouteRateLimitMiddleware,
    adminUserManagementRouteRateLimitMiddleware,
    spaShellRouteRateLimitMiddleware,
    toRetryAfterSeconds
  };
}

module.exports = { createRateLimitRuntime };
