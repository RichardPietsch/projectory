const express = require('express');
const path = require('path');
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const expressRateLimit = require('express-rate-limit');
const { registerModuleRoutes } = require('../modules');
const { attachAuthContext, requirePermission } = require('../auth/middleware');
const { PERMISSIONS, getPermissionsForRole } = require('../auth/permissions');
const { getAuthMode, isLocalDevRuntime, validateAuthRuntimeSafety } = require('../auth/runtime');
const { validatePasswordStrength, hashPassword, verifyPassword } = require('../auth/passwords');
const { createOpaqueToken, hashOpaqueToken } = require('../auth/tokens');
const { normalizeMetricPath, escapePrometheusLabel, serializeCounterMetric } = require('./observability');
const { buildRequestLogHeaders, buildRequestLogBody } = require('./request-logging');
const { startServerRuntime } = require('./bootstrap');
const { registerCoreMiddlewareStack } = require('./middleware-stack');
const { registerAuthRoutes } = require('./auth-routes');
const { createRateLimitRuntime } = require('./rate-limits');
const { registerObservabilityRoutes } = require('./observability-routes');
const { buildAuthHandlers } = require('./auth-handlers');
const { registerAdminRoutes } = require('./admin-routes');
const { createCsrfRuntime } = require('./csrf');

// Single Express app serving API + static frontend.
const app = express();
const port = process.env.PORT || 3000;

function parseTrustProxySetting(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return false;

  const lowered = value.toLowerCase();
  if (lowered === 'true' || lowered === '*') return true;
  if (lowered === 'false') return false;
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  if (['loopback', 'linklocal', 'uniquelocal'].includes(lowered)) return lowered;
  if (value.includes(',')) {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return value;
}

function shouldUseSecureSessionCookie() {
  return !isLocalDevRuntime();
}

function resolveTrustProxySetting() {
  return parseTrustProxySetting(process.env.TRUST_PROXY);
}

app.set('trust proxy', resolveTrustProxySetting());

function resolveDatabaseConfig() {
  const localDev = isLocalDevRuntime();
  return {
    host: process.env.DB_HOST || (localDev ? 'db' : ''),
    port: Number(process.env.DB_PORT || (localDev ? 5432 : 0)),
    database: process.env.DB_NAME || (localDev ? 'helloapp' : ''),
    user: process.env.DB_USER || (localDev ? 'projectory_local_user' : ''),
    password: process.env.DB_PASSWORD || (localDev ? 'projectory_local_password' : '')
  };
}

// Shared Postgres connection pool used across modules/routes.
const pool = new Pool(resolveDatabaseConfig());

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const TRADE_CATALOG = [
  'UX', 'UI', 'DATA', 'STRATEGY', 'CONSULTING', 'DEV-FE', 'DEV-BE', 'DEV-FULLSTACK', 'DEV-OPS',
  'ART', 'COPY', 'CREATIVE', 'IT', 'HR', 'ACCOUNT', 'PO', 'TPM', 'MANAGEMENT', 'ADMIN', 'CONTROLLING',
  'TEMP', 'STUDENT'
];

const LEVEL_CATALOG = ['—', 'JUNIOR', 'MIDWEIGHT', 'SENIOR', 'DIRECTOR', 'C-LEVEL'];
const PROJECT_STATUS_VALUES = ['done', 'in_progress', 'rework_needed'];
const PEOPLE_STATUS_VALUES = ['active', 'paused', 'leaver'];
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '100kb';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
const CORRELATION_ID_HEADER = 'x-correlation-id';

const metricsState = {
  requestsTotal: new Map(),
  requestDurationBuckets: new Map(),
  requestDurationCount: new Map(),
  requestDurationSumMs: new Map(),
  requestErrorsTotal: new Map(),
  authFailuresTotal: new Map(),
  rateLimitHitsTotal: new Map(),
  dbQueryDurationBuckets: new Map(),
  dbQueryDurationCount: 0,
  dbQueryDurationSumMs: 0,
  dbQueryErrorsTotal: 0,
  authLifecycleCleanupRunsTotal: new Map(),
  authLifecycleCleanupDeletedRowsTotal: new Map()
};

const SENSITIVE_LOG_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'tokenhash',
  'token_hash',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'smtp',
  'apikey',
  'api_key',
  'clientsecret',
  'client_secret'
]);

const REQUEST_LOG_HEADER_ALLOWLIST = new Set([
  'content-type',
  'content-length',
  'accept',
  'x-correlation-id'
]);

const METRIC_DURATION_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const authAttemptBuckets = new Map();
const AUTH_ATTEMPT_SWEEP_INTERVAL_MS = 30000;
let lastAuthAttemptSweepAt = 0;



function clearAuthAttemptBuckets() {
  authAttemptBuckets.clear();
  lastAuthAttemptSweepAt = 0;
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

function incrementCounter(map, key, value = 1) {
  map.set(key, (map.get(key) || 0) + value);
}

function observeDurationBuckets(map, keyPrefix, durationMs) {
  const prefix = keyPrefix ? `${keyPrefix}|` : '';
  for (const bucket of METRIC_DURATION_BUCKETS_MS) {
    if (durationMs <= bucket) {
      incrementCounter(map, `${prefix}le=${bucket}`);
    }
  }
  incrementCounter(map, `${prefix}le=+Inf`);
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

const originalPoolQuery = pool.query.bind(pool);
pool.query = async (...args) => {
  const startedAt = Date.now();
  try {
    const result = await originalPoolQuery(...args);
    const durationMs = Date.now() - startedAt;
    observeDurationBuckets(metricsState.dbQueryDurationBuckets, '', durationMs);
    metricsState.dbQueryDurationCount += 1;
    metricsState.dbQueryDurationSumMs += durationMs;
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    observeDurationBuckets(metricsState.dbQueryDurationBuckets, '', durationMs);
    metricsState.dbQueryDurationCount += 1;
    metricsState.dbQueryDurationSumMs += durationMs;
    metricsState.dbQueryErrorsTotal += 1;
    throw error;
  }
};

function normalizeLogKeyName(key) {
  return String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function shouldRedactLogKey(key) {
  const normalized = normalizeLogKeyName(key);
  if (!normalized) return false;
  if (SENSITIVE_LOG_KEYS.has(normalized)) return true;
  return normalized.includes('password') || normalized.includes('token') || normalized.includes('secret');
}

function redactSensitiveValue(value, parentKey = '') {
  if (shouldRedactLogKey(parentKey)) return '[REDACTED]';
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveValue(entry, parentKey));
  }

  if (!value || typeof value !== 'object') return value;

  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = shouldRedactLogKey(key)
      ? '[REDACTED]'
      : redactSensitiveValue(nested, key);
  }
  return output;
}

function buildSafeErrorDetails(error) {
  return {
    type: error?.name || 'Error',
    code: error?.code || null,
    message: shouldRedactLogKey('message') ? '[REDACTED]' : String(error?.message || 'Unknown error')
  };
}

function getCorrelationIdFromHeader(req) {
  const incoming = String(req.header(CORRELATION_ID_HEADER) || '').trim();
  if (incoming && incoming.length <= 128) {
    return incoming;
  }
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function emitStructuredLog(level, event, payload = {}) {
  const record = {
    at: new Date().toISOString(),
    level,
    event,
    ...redactSensitiveValue(payload)
  };

  const rendered = JSON.stringify(record);
  if (level === 'error') {
    console.error(rendered);
    return;
  }
  if (level === 'warn') {
    console.warn(rendered);
    return;
  }
  console.log(rendered);
}

function getAuthProtectionConfig() {
  const maxFailures = Number(process.env.AUTH_PROTECTION_MAX_FAILURES || 5);
  const windowMs = Number(process.env.AUTH_PROTECTION_WINDOW_MS || 15 * 60 * 1000);
  const lockoutMs = Number(process.env.AUTH_PROTECTION_LOCKOUT_MS || 15 * 60 * 1000);
  const backoffBaseMs = Number(process.env.AUTH_PROTECTION_BACKOFF_BASE_MS || 500);
  const backoffMaxMs = Number(process.env.AUTH_PROTECTION_BACKOFF_MAX_MS || 10000);
  return {
    maxFailures: Number.isFinite(maxFailures) && maxFailures > 0 ? maxFailures : 5,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 15 * 60 * 1000,
    lockoutMs: Number.isFinite(lockoutMs) && lockoutMs > 0 ? lockoutMs : 15 * 60 * 1000,
    backoffBaseMs: Number.isFinite(backoffBaseMs) && backoffBaseMs > 0 ? backoffBaseMs : 500,
    backoffMaxMs: Number.isFinite(backoffMaxMs) && backoffMaxMs > 0 ? backoffMaxMs : 10000
  };
}

function obfuscateSecurityKey(rawValue) {
  return crypto.createHash('sha256').update(String(rawValue || 'unknown')).digest('hex').slice(0, 16);
}


function emitAuthSecurityEvent(eventName, fields = {}) {
  if (String(eventName).includes('failed') || String(eventName).includes('throttled')) {
    incrementCounter(metricsState.authFailuresTotal, eventName, 1);
  }

  emitStructuredLog('warn', 'auth.security', {
    securityEvent: eventName,
    ...fields
  });
}

function buildAuthThrottleKey(scope, { ip, identifier }) {
  return `${scope}:${obfuscateSecurityKey(ip)}:${obfuscateSecurityKey(identifier)}`;
}

function sweepExpiredAuthAttemptBuckets(now, config) {
  if (now - lastAuthAttemptSweepAt < AUTH_ATTEMPT_SWEEP_INTERVAL_MS) {
    return;
  }

  for (const [key, bucket] of authAttemptBuckets.entries()) {
    const isExpired = now - bucket.firstFailureAt >= config.windowMs
      && now >= bucket.backoffUntil
      && now >= bucket.lockedUntil;
    if (isExpired) {
      authAttemptBuckets.delete(key);
    }
  }

  lastAuthAttemptSweepAt = now;
}

function getAuthThrottleState(key, config) {
  const now = Date.now();
  sweepExpiredAuthAttemptBuckets(now, config);
  const bucket = authAttemptBuckets.get(key);
  if (!bucket) {
    return { throttled: false, locked: false, retryAfterMs: 0, failureCount: 0 };
  }

  if (now - bucket.firstFailureAt >= config.windowMs) {
    authAttemptBuckets.delete(key);
    return { throttled: false, locked: false, retryAfterMs: 0, failureCount: 0 };
  }

  if (bucket.lockedUntil > now) {
    return { throttled: true, locked: true, retryAfterMs: bucket.lockedUntil - now, failureCount: bucket.failures };
  }

  if (bucket.backoffUntil > now) {
    return { throttled: true, locked: false, retryAfterMs: bucket.backoffUntil - now, failureCount: bucket.failures };
  }

  return { throttled: false, locked: false, retryAfterMs: 0, failureCount: bucket.failures };
}

function registerAuthFailure(key, config) {
  const now = Date.now();
  const current = authAttemptBuckets.get(key);
  const resetWindow = !current || now - current.firstFailureAt >= config.windowMs;
  const failures = resetWindow ? 1 : current.failures + 1;
  const backoffMs = Math.min(config.backoffBaseMs * (2 ** Math.max(0, failures - 1)), config.backoffMaxMs);
  const lockUntil = failures >= config.maxFailures ? now + config.lockoutMs : 0;
  const bucket = {
    firstFailureAt: resetWindow ? now : current.firstFailureAt,
    failures,
    backoffUntil: now + backoffMs,
    lockedUntil: lockUntil
  };
  authAttemptBuckets.set(key, bucket);
  return {
    failures,
    backoffMs,
    locked: lockUntil > now,
    retryAfterMs: Math.max(lockUntil - now, backoffMs)
  };
}

function clearAuthFailureState(key) {
  authAttemptBuckets.delete(key);
}

function toRetryAfterSeconds(retryAfterMs) {
  const asSeconds = Math.ceil(Math.max(0, Number(retryAfterMs) || 0) / 1000);
  return asSeconds > 0 ? asSeconds : 1;
}

function sendAuthFailure(res, statusCode, message) {
  return res.status(statusCode).json({ error: message });
}

function sendAuthThrottle(res, message, retryAfterMs) {
  res.setHeader('Retry-After', String(toRetryAfterSeconds(retryAfterMs)));
  return res.status(429).json({ error: message });
}




const rateLimitRuntime = createRateLimitRuntime({
  pool,
  expressRateLimit,
  env: process.env,
  onRateLimitEvent: ({ scope, outcome, method, path, actorKey }) => {
    incrementCounter(
      metricsState.rateLimitHitsTotal,
      `${String(scope || 'unknown')}|${String(outcome || 'unknown')}|${String(method || 'GET').toUpperCase()}|${normalizeMetricPath(path || '/unknown')}`,
      1
    );

    emitStructuredLog('warn', 'rate_limit.event', {
      scope: String(scope || 'unknown'),
      outcome: String(outcome || 'unknown'),
      method: String(method || 'GET').toUpperCase(),
      path: String(path || ''),
      actorHash: obfuscateSecurityKey(actorKey || 'unknown')
    });
  }
});
const {
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
  importRouteExpressRateLimitMiddleware,
  importPreviewRouteRateLimitMiddleware,
  importConfigRouteRateLimitMiddleware,
  projectsMutationRouteRateLimitMiddleware,
  assignmentsMutationRouteRateLimitMiddleware,
  configurationMutationRouteRateLimitMiddleware,
  adminAuditRouteRateLimitMiddleware,
  adminUserManagementRouteRateLimitMiddleware,
  spaShellRouteRateLimitMiddleware
} = rateLimitRuntime;

function createRequestLifecycleLogger() {
  return (req, res, next) => {
    req.correlationId = getCorrelationIdFromHeader(req);
    res.setHeader('x-correlation-id', req.correlationId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");

    const startedAt = Date.now();
    const normalizedPath = normalizeMetricPath(req.path);
    emitStructuredLog('info', 'request.start', {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      ipHash: obfuscateSecurityKey(req.ip || req.socket?.remoteAddress || 'unknown'),
      userAgent: req.header('user-agent') || null,
      requestHeaders: buildRequestLogHeaders(req, REQUEST_LOG_HEADER_ALLOWLIST),
      requestBody: buildRequestLogBody(req, { obfuscateSecurityKey })
    });

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const method = String(req.method || 'GET').toUpperCase();
      const statusCode = Number(res.statusCode || 0);
      const requestKey = `${method}|${normalizedPath}|${statusCode}`;
      incrementCounter(metricsState.requestsTotal, requestKey, 1);

      const durationKey = `${method}|${normalizedPath}`;
      observeDurationBuckets(metricsState.requestDurationBuckets, durationKey, durationMs);
      incrementCounter(metricsState.requestDurationCount, durationKey, 1);
      incrementCounter(metricsState.requestDurationSumMs, durationKey, durationMs);

      if (statusCode >= 500) {
        incrementCounter(metricsState.requestErrorsTotal, `${method}|${normalizedPath}`, 1);
      }

      emitStructuredLog('info', 'request.finish', {
        correlationId: req.correlationId,
        method: req.method,
        path: req.path,
        statusCode,
        durationMs
      });
    });

    next();
  };
}

registerCoreMiddlewareStack({
  app,
  requestRateLimitMiddleware,
  appWideDoSRateLimitMiddleware,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  requestBodyLimit: REQUEST_BODY_LIMIT,
  createRequestLifecycleLogger,
  attachAuthContext,
  staticAssetsPath: express.static(path.join(__dirname, '..', '..', 'public')),
  adminAuditRouteRateLimitMiddleware
});

const AUTH_SESSION_COOKIE = 'projectory_session';
const CSRF_RUNTIME_SECRET = String(process.env.AUTH_CSRF_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');
const csrfRuntime = createCsrfRuntime({ secret: CSRF_RUNTIME_SECRET });
const AUTH_SESSION_TTL_HOURS = Number(process.env.AUTH_SESSION_TTL_HOURS || 12);
const PASSWORD_RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);
const SMTP_PASSWORD_PREFIX = 'enc:v1:';
const AUDIT_LOG_RETENTION_MONTHS = Number(process.env.AUDIT_LOG_RETENTION_MONTHS || 6);
const AUTH_LIFECYCLE_CLEANUP_INTERVAL_MS = Number(process.env.AUTH_LIFECYCLE_CLEANUP_INTERVAL_MS || 15 * 60 * 1000);
const AUTH_SESSION_CLEANUP_RETENTION_HOURS = Number(process.env.AUTH_SESSION_CLEANUP_RETENTION_HOURS || 24);
const PASSWORD_RESET_TOKEN_CLEANUP_RETENTION_HOURS = Number(process.env.PASSWORD_RESET_TOKEN_CLEANUP_RETENTION_HOURS || 168);
const USER_INVITE_CLEANUP_RETENTION_HOURS = Number(process.env.USER_INVITE_CLEANUP_RETENTION_HOURS || 168);

function validateRuntimeEnvironment() {
  if (isLocalDevRuntime()) {
    return;
  }

  const requiredNames = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'SMTP_PASSWORD_ENCRYPTION_KEY', 'AUTH_CSRF_SECRET'];
  const missing = requiredNames.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables for non-local runtime: ${missing.join(', ')}.`);
  }

  if (String(process.env.DB_USER).trim() === 'projectory_local_user' || String(process.env.DB_PASSWORD).trim() === 'projectory_local_password') {
    throw new Error('Unsafe database credentials detected for non-local runtime. Replace DB_USER/DB_PASSWORD defaults.');
  }

  if (String(process.env.SMTP_PASSWORD_ENCRYPTION_KEY || '').trim().length < 32) {
    throw new Error('SMTP_PASSWORD_ENCRYPTION_KEY must be set to a strong secret (minimum 32 characters) in non-local runtime.');
  }


  if (resolveTrustProxySetting() === false) {
    throw new Error('TRUST_PROXY must be configured for non-local runtime to ensure secure proxy-aware session handling.');
  }

  if (String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase() === 'false') {
    throw new Error('AUTH_COOKIE_SECURE=false is not allowed in non-local runtime.');
  }
}

function buildSessionOnlyFallbackAuth(previousAuth = {}) {
  // Rollout safety: in strict session mode we never trust header role simulation.
  return {
    ...previousAuth,
    userId: null,
    email: null,
    displayName: null,
    personId: null,
    role: 'viewer',
    roles: ['viewer'],
    permissions: getPermissionsForRole('viewer'),
    authSource: 'anonymous',
    scopedProjectIds: [],
    isScopedTeammate: false
  };
}


function parseActorUserId(auth) {
  const candidate = Number.parseInt(auth?.userId, 10);
  return Number.isInteger(candidate) && candidate > 0 ? candidate : null;
}

function inferEntityContext(requestPath) {
  const segments = String(requestPath || '').split('/').filter(Boolean);
  // Expected format starts with /api/...; keep this heuristic intentionally lightweight.
  if (segments.length < 2 || segments[0] !== 'api') {
    return { entityType: null, entityId: null };
  }

  const entityType = segments[1] || null;
  const idCandidate = segments[2];
  const entityId = idCandidate && /^\d+$/.test(idCandidate) ? idCandidate : null;
  return { entityType, entityId };
}

function buildAuditAction(method, requestPath) {
  return `${String(method || 'GET').toUpperCase()} ${String(requestPath || '')}`;
}

async function recordAuditEvent({ req, res }) {
  if (String(process.env.AUDIT_LOG_ENABLED || 'true').toLowerCase() === 'false') {
    return;
  }

  if (!String(req.path || '').startsWith('/api/')) {
    return;
  }

  if (['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase())) {
    return;
  }

  const { entityType, entityId } = inferEntityContext(req.path);
  const metadata = {
    authSource: req.auth?.authSource || 'header',
    isScopedTeammate: Boolean(req.auth?.isScopedTeammate),
    scopedProjectIds: req.auth?.scopedProjectIds || [],
    authMode: getAuthMode()
  };

  await pool.query(
    `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, status_code, request_path, ip_address, user_agent, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      parseActorUserId(req.auth),
      req.auth?.role || null,
      buildAuditAction(req.method, req.path),
      entityType,
      entityId,
      Number(res.statusCode || 0),
      req.path,
      req.ip || null,
      req.header('user-agent') || null,
      JSON.stringify(metadata)
    ]
  );
}

async function cleanupAuditLogRetention() {
  const months = Number.isFinite(AUDIT_LOG_RETENTION_MONTHS) && AUDIT_LOG_RETENTION_MONTHS > 0
    ? AUDIT_LOG_RETENTION_MONTHS
    : 6;

  await pool.query(
    `DELETE FROM audit_log
     WHERE created_at < NOW() - ($1::text || ' months')::interval`,
    [String(months)]
  );
}

function sanitizeRetentionHours(value, fallbackHours) {
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  return fallbackHours;
}

async function cleanupAuthLifecycleArtifacts() {
  const sessionRetentionHours = sanitizeRetentionHours(AUTH_SESSION_CLEANUP_RETENTION_HOURS, 24);
  const passwordResetRetentionHours = sanitizeRetentionHours(PASSWORD_RESET_TOKEN_CLEANUP_RETENTION_HOURS, 168);
  const userInviteRetentionHours = sanitizeRetentionHours(USER_INVITE_CLEANUP_RETENTION_HOURS, 168);

  const [sessionResult, passwordResetResult, userInviteResult] = await Promise.all([
    pool.query(
      `DELETE FROM auth_sessions
       WHERE expires_at < NOW() - (($1::numeric) * INTERVAL '1 hour')
          OR (revoked_at IS NOT NULL AND revoked_at < NOW() - (($1::numeric) * INTERVAL '1 hour'))`,
      [sessionRetentionHours]
    ),
    pool.query(
      `DELETE FROM password_reset_tokens
       WHERE expires_at < NOW() - (($1::numeric) * INTERVAL '1 hour')
          OR (used_at IS NOT NULL AND used_at < NOW() - (($1::numeric) * INTERVAL '1 hour'))`,
      [passwordResetRetentionHours]
    ),
    pool.query(
      `DELETE FROM user_invites
       WHERE expires_at < NOW() - (($1::numeric) * INTERVAL '1 hour')
          OR (accepted_at IS NOT NULL AND accepted_at < NOW() - (($1::numeric) * INTERVAL '1 hour'))`,
      [userInviteRetentionHours]
    )
  ]);

  incrementCounter(metricsState.authLifecycleCleanupDeletedRowsTotal, 'auth_sessions', Number(sessionResult.rowCount || 0));
  incrementCounter(metricsState.authLifecycleCleanupDeletedRowsTotal, 'password_reset_tokens', Number(passwordResetResult.rowCount || 0));
  incrementCounter(metricsState.authLifecycleCleanupDeletedRowsTotal, 'user_invites', Number(userInviteResult.rowCount || 0));
  incrementCounter(metricsState.authLifecycleCleanupRunsTotal, 'success', 1);
}

function parseCookieHeader(rawCookieHeader) {
  const cookieMap = new Map();
  const value = String(rawCookieHeader || '').trim();
  if (!value) return cookieMap;

  for (const part of value.split(';')) {
    const [rawKey, ...rawValueParts] = part.split('=');
    const key = String(rawKey || '').trim();
    if (!key) continue;
    cookieMap.set(key, decodeURIComponent(rawValueParts.join('=').trim()));
  }

  return cookieMap;
}

function serializeSessionCookie(sessionId, expiresAt) {
  const maxAgeSeconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const secureAttribute = shouldUseSecureSessionCookie() ? '; Secure' : '';
  return `${AUTH_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureAttribute}`;
}

function clearSessionCookie() {
  const secureAttribute = shouldUseSecureSessionCookie() ? '; Secure' : '';
  return `${AUTH_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttribute}`;
}

function sanitizeRoleInput(roleName) {
  return String(roleName || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function getSmtpEncryptionKey() {
  const configured = String(process.env.SMTP_PASSWORD_ENCRYPTION_KEY || '').trim();
  if (!configured) return null;

  const asHex = /^[0-9a-f]+$/i.test(configured) && configured.length % 2 === 0
    ? Buffer.from(configured, 'hex')
    : null;
  const asBase64 = /^[A-Za-z0-9+/=]+$/.test(configured)
    ? Buffer.from(configured, 'base64')
    : null;
  const raw = asHex && asHex.length >= 32 ? asHex : asBase64 && asBase64.length >= 32 ? asBase64 : Buffer.from(configured);

  if (raw.length < 32) {
    return null;
  }

  return crypto.createHash('sha256').update(raw).digest();
}

function encryptSmtpPassword(plaintext) {
  if (!plaintext) return null;
  const key = getSmtpEncryptionKey();
  if (!key) {
    throw new Error('SMTP password encryption key is not configured. Set SMTP_PASSWORD_ENCRYPTION_KEY.');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SMTP_PASSWORD_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSmtpPassword(value) {
  const serialized = String(value || '').trim();
  if (!serialized) return '';
  if (!serialized.startsWith(SMTP_PASSWORD_PREFIX)) {
    return serialized;
  }

  const key = getSmtpEncryptionKey();
  if (!key) {
    throw new Error('SMTP password encryption key is not configured. Set SMTP_PASSWORD_ENCRYPTION_KEY.');
  }

  const [, payload] = serialized.split(SMTP_PASSWORD_PREFIX);
  const [ivB64, tagB64, dataB64] = String(payload || '').split(':');
  const iv = Buffer.from(String(ivB64 || ''), 'base64');
  const tag = Buffer.from(String(tagB64 || ''), 'base64');
  const encrypted = Buffer.from(String(dataB64 || ''), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

async function resolveSmtpSettingsRow(row, { persistLegacyUpgrade = false } = {}) {
  const smtp = { ...(row || {}) };
  const storedPassword = String(smtp.password || '').trim();
  if (!storedPassword) {
    smtp.password = '';
    return smtp;
  }

  if (storedPassword.startsWith(SMTP_PASSWORD_PREFIX)) {
    smtp.password = decryptSmtpPassword(storedPassword);
    return smtp;
  }

  if (persistLegacyUpgrade) {
    try {
      const encrypted = encryptSmtpPassword(storedPassword);
      await pool.query('UPDATE smtp_settings SET password = $1, updated_at = NOW() WHERE id = 1', [encrypted]);
      smtp.password = storedPassword;
      emitAuthSecurityEvent('smtp_password_upgraded', { endpoint: 'smtp-settings' });
      return smtp;
    } catch (error) {
      emitAuthSecurityEvent('smtp_password_upgrade_failed', { endpoint: 'smtp-settings', reason: String(error?.message || 'unknown') });
    }
  }

  smtp.password = storedPassword;
  return smtp;
}

function redactSmtpSettings(row) {
  return {
    host: row?.host || '',
    port: row?.port || '',
    username: row?.username || '',
    fromEmail: row?.from_email || '',
    secure: Boolean(row?.secure),
    enabled: Boolean(row?.enabled),
    passwordSet: Boolean(row?.password)
  };
}

function buildTestEmailMessage({ fromEmail, toEmail }) {
  const timestamp = new Date().toISOString();
  return [
    `From: ${fromEmail}`,
    `To: ${toEmail}`,
    'Subject: Projectory SMTP test email',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    `This is a test email sent by Projectory at ${timestamp}.`,
    '',
    'If you received this message, SMTP configuration is working.'
  ].join('\r\n');
}

function readSmtpResponse(socket, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('SMTP server response timed out.'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('end', onEnd);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onEnd() {
      cleanup();
      reject(new Error('SMTP connection closed unexpectedly.'));
    }

    function onData(chunk) {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n').filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';
      if (/^\d{3} /.test(lastLine)) {
        cleanup();
        const code = Number.parseInt(lastLine.slice(0, 3), 10);
        resolve({ code, message: buffer.trim() });
      }
    }

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('end', onEnd);
  });
}

function parseSmtpCapabilities(message) {
  return String(message || '')
    .split('\r\n')
    .map((line) => line.trim())
    .filter((line) => /^250[\s-]/.test(line))
    .map((line) => line.slice(4).trim().toUpperCase());
}

async function writeSmtpCommand(socket, command, expectedCodes) {
  socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP command failed (${command.split(' ')[0]}): ${response.message}`);
  }
  return response;
}

function getSmtpAuthMethods(capabilities) {
  const methods = new Set();

  for (const capability of capabilities || []) {
    const normalized = String(capability || '').trim().toUpperCase();

    if (normalized.startsWith('AUTH=')) {
      normalized
        .slice('AUTH='.length)
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((method) => methods.add(method));
      continue;
    }

    if (normalized.startsWith('AUTH ')) {
      normalized
        .slice('AUTH '.length)
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((method) => methods.add(method));
    }
  }

  return Array.from(methods);
}

async function authenticateSmtp(socket, capabilities, username, password) {
  const methods = getSmtpAuthMethods(capabilities);

  if (methods.includes('PLAIN')) {
    const plainToken = Buffer.from(`${String.fromCharCode(0)}${username}${String.fromCharCode(0)}${password}`).toString('base64');
    await writeSmtpCommand(socket, `AUTH PLAIN ${plainToken}`, [235]);
    return;
  }

  if (methods.includes('LOGIN') || methods.length === 0) {
    await writeSmtpCommand(socket, 'AUTH LOGIN', [334]);
    await writeSmtpCommand(socket, Buffer.from(String(username)).toString('base64'), [334]);
    await writeSmtpCommand(socket, Buffer.from(String(password)).toString('base64'), [235]);
    return;
  }

  throw new Error(`SMTP AUTH mechanism not supported by server (advertised: ${methods.join(', ')}).`);
}


async function sendSmtpEmail(config, { toEmail, subject, textBody }) {
  const host = String(config.host || '').trim();
  const port = Number(config.port || 0);
  const secure = config.secure !== false;
  const fromEmail = String(config.from_email || '').trim();

  if (!host || !port) {
    throw new Error('SMTP host and port are required.');
  }

  if (!isValidEmail(fromEmail) || !isValidEmail(toEmail)) {
    throw new Error('fromEmail and toEmail must be valid email addresses.');
  }

  let connection = secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      connection.off('connect', onConnect);
      reject(error);
    };
    const onConnect = () => {
      connection.off('error', onError);
      resolve();
    };
    connection.once('error', onError);
    connection.once('connect', onConnect);
  });

  try {
    const greeting = await readSmtpResponse(connection);
    if (greeting.code !== 220) {
      throw new Error(`SMTP greeting failed: ${greeting.message}`);
    }

    let ehlo = await writeSmtpCommand(connection, 'EHLO projectory.local', [250]);
    let capabilities = parseSmtpCapabilities(ehlo.message);

    if (!secure && capabilities.includes('STARTTLS')) {
      await writeSmtpCommand(connection, 'STARTTLS', [220]);
      connection = tls.connect({ socket: connection, servername: host });
      await new Promise((resolve, reject) => {
        connection.once('secureConnect', resolve);
        connection.once('error', reject);
      });
      ehlo = await writeSmtpCommand(connection, 'EHLO projectory.local', [250]);
      capabilities = parseSmtpCapabilities(ehlo.message);
    }

    if (config.username && config.password) {
      await authenticateSmtp(connection, capabilities, String(config.username), String(config.password));
    }

    await writeSmtpCommand(connection, `MAIL FROM:<${fromEmail}>`, [250]);
    await writeSmtpCommand(connection, `RCPT TO:<${String(toEmail).trim()}>`, [250, 251]);
    await writeSmtpCommand(connection, 'DATA', [354]);

    const message = [
      `From: ${fromEmail}`,
      `To: ${String(toEmail).trim()}`,
      `Subject: ${String(subject || 'Projectory notification')}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      String(textBody || '')
    ].join('\r\n');

    connection.write(`${message}\r\n.\r\n`);
    const dataResponse = await readSmtpResponse(connection);
    if (dataResponse.code !== 250) {
      throw new Error(`SMTP DATA failed: ${dataResponse.message}`);
    }

    await writeSmtpCommand(connection, 'QUIT', [221]);
  } finally {
    connection.end();
  }
}

async function sendSmtpTestEmail(config, toEmail) {
  const timestamp = new Date().toISOString();
  return sendSmtpEmail(config, {
    toEmail,
    subject: 'Projectory SMTP test email',
    textBody: [
      `This is a test email sent by Projectory at ${timestamp}.`,
      '',
      'If you received this message, SMTP configuration is working.'
    ].join('\n')
  });
}


async function getRoleIdByName(roleName) {
  const normalized = sanitizeRoleInput(roleName);
  const result = await pool.query(
    `SELECT id, name
     FROM roles
     WHERE LOWER(name) = $1
     LIMIT 1`,
    [normalized]
  );

  return result.rowCount ? result.rows[0] : null;
}

async function isInitialAdminRegistrationOpen(client = pool) {
  const result = await client.query('SELECT id FROM users LIMIT 1');
  return result.rowCount === 0;
}


async function getAdminUserIds(client = pool) {
  const result = await client.query(
    `SELECT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE LOWER(r.name) = 'admin'`
  );

  return result.rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
}

function resolveBootstrapAdminId(adminUserIds = []) {
  return adminUserIds.length ? Math.min(...adminUserIds) : null;
}
async function createUserInvite(userId, invitedByUserId, expiresHours = 72) {
  const token = createOpaqueToken(32);
  const tokenHash = hashOpaqueToken(token);
  const inserted = await pool.query(
    `INSERT INTO user_invites (user_id, token_hash, expires_at, invited_by_user_id)
     VALUES ($1, $2, NOW() + ($3::text || ' hours')::interval, $4)
     RETURNING id, expires_at, created_at`,
    [userId, tokenHash, String(expiresHours), invitedByUserId || null]
  );

  const appBaseUrl = String(process.env.APP_BASE_URL || 'http://localhost:3000/').trim();
  const inviteLink = `${appBaseUrl.replace(/\/$/, '')}/invite?token=${encodeURIComponent(token)}`;

  return {
    id: inserted.rows[0]?.id || null,
    token,
    inviteLink,
    expiresAt: inserted.rows[0]?.expires_at || null,
    createdAt: inserted.rows[0]?.created_at || null
  };
}

function buildInviteEmailBody({ inviteLink, recipientName, expiresHours }) {
  const greetingName = String(recipientName || '').trim() || 'there';
  return [
    `Hi ${greetingName},`,
    '',
    'You have been invited to Projectory.',
    `Use this link to activate your account and set your password: ${inviteLink}`,
    '',
    `This invite expires in ${expiresHours} hour(s).`,
    '',
    'If you were not expecting this invite, you can ignore this email.'
  ].join('\n');
}


async function createPasswordResetToken(userId, requestedIp) {
  const token = createOpaqueToken(32);
  const tokenHash = hashOpaqueToken(token);

  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, NOW() + ($3::text || ' minutes')::interval, $4)`,
    [userId, tokenHash, String(PASSWORD_RESET_TTL_MINUTES), requestedIp || null]
  );

  const appBaseUrl = String(process.env.APP_BASE_URL || 'http://localhost:3000/').trim();
  const resetLink = `${appBaseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

  return {
    token,
    resetLink,
    expiresMinutes: PASSWORD_RESET_TTL_MINUTES
  };
}

function buildForgotPasswordEmailBody({ resetLink, expiresMinutes }) {
  return [
    'Hi,',
    '',
    'We received a request to reset your Projectory password.',
    `Open this link to set a new password: ${resetLink}`,
    '',
    `This reset link expires in ${expiresMinutes} minute(s).`,
    '',
    'If you did not request a password reset, you can ignore this email.'
  ].join('\n');
}

// Teammates are project-scoped; this helper keeps scope checks explicit.
function isScopedTeammate(auth) {
  return String(auth?.role || '').toLowerCase() === 'teammate';
}

function canAccessProjectById(auth, projectId) {
  if (!isScopedTeammate(auth)) return true;
  const normalizedProjectId = Number.parseInt(projectId, 10);
  if (!Number.isInteger(normalizedProjectId) || normalizedProjectId <= 0) return false;
  return (auth.scopedProjectIds || []).includes(normalizedProjectId);
}

async function resolveTeammateScopedProjectIds(auth) {
  const scopedIds = new Set((auth?.scopedProjectIds || [])
    .map((id) => Number.parseInt(id, 10))
    .filter((id) => Number.isInteger(id) && id > 0));

  if (!isScopedTeammate(auth)) {
    return [...scopedIds];
  }

  const personId = Number.parseInt(auth?.personId, 10);
  if (!Number.isInteger(personId) || personId <= 0) {
    return [...scopedIds];
  }

  const assignmentScope = await pool.query(
    `SELECT DISTINCT project_id
     FROM assignments
     WHERE person_id = $1`,
    [personId]
  );

  for (const row of assignmentScope.rows) {
    const projectId = Number.parseInt(row.project_id, 10);
    if (Number.isInteger(projectId) && projectId > 0) scopedIds.add(projectId);
  }

  return [...scopedIds];
}

async function getChallengeProjectId(challengeId) {
  const result = await pool.query(
    `SELECT project_id
     FROM challenges
     WHERE id = $1
     LIMIT 1`,
    [challengeId]
  );

  if (result.rowCount === 0) return null;
  return Number(result.rows[0].project_id);
}

async function getAssignmentProjectContext(assignmentId) {
  const result = await pool.query(
    `SELECT id, project_id, person_id
     FROM assignments
     WHERE id = $1
     LIMIT 1`,
    [assignmentId]
  );

  if (result.rowCount === 0) return null;
  return {
    assignmentId: Number(result.rows[0].id),
    projectId: Number(result.rows[0].project_id),
    personId: Number(result.rows[0].person_id)
  };
}

async function replaceUserProjectScope(userId, projectIds) {
  const normalized = [...new Set((projectIds || [])
    .map((id) => Number.parseInt(id, 10))
    .filter((id) => Number.isInteger(id) && id > 0))];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_project_access WHERE user_id = $1', [userId]);

    for (const projectId of normalized) {
      await client.query(
        `INSERT INTO user_project_access (user_id, project_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [userId, projectId]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return normalized;
}


async function loadSessionAuthContext(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const sessionId = cookies.get(AUTH_SESSION_COOKIE);
  if (!sessionId) return null;

  const result = await pool.query(
    `SELECT s.id AS session_id,
            s.expires_at,
            s.revoked_at,
            u.id AS user_id,
            u.email,
            u.display_name,
            u.person_id,
            COALESCE(ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles,
            COALESCE(ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), ARRAY[]::text[]) AS db_permissions,
            COALESCE(ARRAY_AGG(DISTINCT upa.project_id) FILTER (WHERE upa.project_id IS NOT NULL), ARRAY[]::int[]) AS scoped_project_ids
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     LEFT JOIN user_project_access upa ON upa.user_id = u.id
     WHERE s.id = $1
     GROUP BY s.id, s.expires_at, s.revoked_at, u.id, u.email, u.display_name, u.person_id`,
    [sessionId]
  );

  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  if (row.revoked_at) return null;
  const expiry = new Date(row.expires_at);
  if (expiry.getTime() <= Date.now()) return null;

  const roles = (row.roles || []).map((role) => String(role || '').toLowerCase()).filter(Boolean);
  const role = roles[0] || 'viewer';
  const mergedPermissions = new Set([...(row.db_permissions || []), ...getPermissionsForRole(role)]);

  return {
    sessionId: row.session_id,
    userId: String(row.user_id),
    email: row.email,
    displayName: row.display_name,
    personId: row.person_id ? Number(row.person_id) : null,
    role,
    roles,
    permissions: [...mergedPermissions],
    scopedProjectIds: (row.scoped_project_ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
    isScopedTeammate: role === 'teammate'
  };
}

// Session auth overlay: for requests with a valid session cookie we override header simulation context.
app.use(async (req, _res, next) => {
  try {
    const sessionAuth = await loadSessionAuthContext(req);
    if (sessionAuth) {
      req.auth = {
        ...req.auth,
        ...sessionAuth,
        authSource: 'session'
      };

      await pool.query(
        `UPDATE auth_sessions
         SET last_seen_at = NOW()
         WHERE id = $1`,
        [sessionAuth.sessionId]
      );
    } else if (getAuthMode() === 'session') {
      req.auth = buildSessionOnlyFallbackAuth(req.auth);
    } else {
      req.auth = {
        ...req.auth,
        authSource: 'header',
        scopedProjectIds: [],
        isScopedTeammate: isScopedTeammate(req.auth)
      };
    }

    if (isScopedTeammate(req.auth)) {
      req.auth.scopedProjectIds = await resolveTeammateScopedProjectIds(req.auth);
      req.auth.isScopedTeammate = true;
    }
  } catch (_error) {
    // Keep app available even when auth storage is unavailable.
    req.auth = getAuthMode() === 'session'
      ? buildSessionOnlyFallbackAuth(req.auth)
      : {
          ...req.auth,
          authSource: 'header',
          scopedProjectIds: [],
          isScopedTeammate: isScopedTeammate(req.auth)
        };
  }

  next();
});

app.use(csrfRuntime.requireSessionCsrf);

// Audit middleware: records mutating API actions for admin traceability.
app.use((req, res, next) => {
  res.on('finish', () => {
    recordAuditEvent({ req, res }).catch(() => {
      // Best-effort logging; never fail a user request because audit storage is unavailable.
    });
  });

  next();
});

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'off', 'no'].includes(normalized)) return false;
  return null;
}

function parseWorkingHours(value) {
  if (value === undefined || value === null || value === '') return 40;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

// Normalize common Postgres errors into stable API responses.
function handleDbError(res, error) {
  const req = res?.req;

  if (error.code === '23503') {
    emitStructuredLog('error', 'request.error', {
      correlationId: req?.correlationId || null,
      method: req?.method || null,
      path: req?.path || null,
      statusCode: 409,
      error: buildSafeErrorDetails(error)
    });
    return res.status(409).json({ error: 'Cannot delete record because dependencies exist.' });
  }

  if (error.code === '23514') {
    emitStructuredLog('error', 'request.error', {
      correlationId: req?.correlationId || null,
      method: req?.method || null,
      path: req?.path || null,
      statusCode: 400,
      error: buildSafeErrorDetails(error)
    });
    return res.status(400).json({ error: 'Validation error.' });
  }

  if (error.code === '23505') {
    emitStructuredLog('error', 'request.error', {
      correlationId: req?.correlationId || null,
      method: req?.method || null,
      path: req?.path || null,
      statusCode: 409,
      error: buildSafeErrorDetails(error)
    });
    return res.status(409).json({ error: 'Duplicate value conflict.' });
  }

  emitStructuredLog('error', 'request.error', {
    correlationId: req?.correlationId || null,
    method: req?.method || null,
    path: req?.path || null,
    statusCode: 500,
    error: buildSafeErrorDetails(error)
  });
  return res.status(500).json({ error: 'Unexpected server error.' });
}

function requireMonth(value, fieldName) {
  if (!MONTH_REGEX.test(value || '')) {
    return `${fieldName} must be in yyyy-mm format.`;
  }
  return null;
}

function normalizeProjectStatus(status, fallback = 'in_progress') {
  const normalized = String(status || '').trim().toLowerCase();
  const legacyMap = { green: 'done', blue: 'in_progress', yellow: 'in_progress', red: 'rework_needed', white: 'in_progress' };
  const mapped = legacyMap[normalized] || normalized;
  if (PROJECT_STATUS_VALUES.includes(mapped)) return mapped;
  return fallback;
}


function normalizePeopleStatus(status, fallback = 'active') {
  const normalized = String(status || '').trim().toLowerCase();
  if (PEOPLE_STATUS_VALUES.includes(normalized)) return normalized;
  return fallback;
}

async function getPersonProjectTotalQuantity(personId, projectId, client = pool) {
  const result = await client.query(
    `SELECT COALESCE(SUM(quantity), 0) AS total_quantity
     FROM assignments
     WHERE person_id = $1 AND project_id = $2`,
    [personId, projectId]
  );

  return Number(result.rows[0]?.total_quantity || 0);
}

// Keep assignment quantity split consistent per person+project (sum = target).
async function distributeProjectQuantityAcrossAssignments(personId, projectId, totalQuantity, client = pool) {
  const assignments = await client.query(
    `SELECT id
     FROM assignments
     WHERE person_id = $1 AND project_id = $2
     ORDER BY id`,
    [personId, projectId]
  );

  const count = assignments.rowCount;
  if (count === 0) {
    return;
  }

  const totalBps = Math.round(Number(totalQuantity) * 100);
  const baseBps = Math.floor(totalBps / count);
  let remaining = totalBps;

  for (let i = 0; i < count; i += 1) {
    const bps = i === count - 1 ? remaining : baseBps;
    remaining -= bps;
    const quantity = (bps / 100).toFixed(2);

    await client.query(
      `UPDATE assignments
       SET quantity = $1
       WHERE id = $2`,
      [quantity, assignments.rows[i].id]
    );
  }
}


async function getPeopleCatalogLookups(client = pool) {
  const [trades, levels] = await Promise.all([
    client.query('SELECT id, name FROM trades ORDER BY name'),
    client.query('SELECT id, name FROM levels ORDER BY sort_order, id')
  ]);

  return {
    tradeByName: new Map(trades.rows.map((row) => [String(row.name).toUpperCase(), row.id])),
    levelByName: new Map(levels.rows.map((row) => [String(row.name).toUpperCase(), row.id]))
  };
}


const authHandlers = buildAuthHandlers({
  getAuthMode,
  isInitialAdminRegistrationOpen,
  handleDbError,
  badRequest,
  validatePasswordStrength,
  pool,
  hashPassword,
  createOpaqueToken,
  AUTH_SESSION_TTL_HOURS,
  serializeSessionCookie,
  isValidEmail,
  verifyPassword,
  buildAuthThrottleKey,
  getAuthProtectionConfig,
  getAuthThrottleState,
  emitAuthSecurityEvent,
  obfuscateSecurityKey,
  sendAuthThrottle,
  registerAuthFailure,
  sendAuthFailure,
  clearAuthFailureState,
  PASSWORD_RESET_TTL_MINUTES,
  hashOpaqueToken,
  createPasswordResetToken,
  resolveSmtpSettingsRow,
  sendSmtpEmail,
  buildForgotPasswordEmailBody
});

registerAuthRoutes({
  app,
  loginRouteRateLimitMiddleware,
  registerInitialAdminRouteRateLimitMiddleware,
  bootstrapStatusRouteRateLimitMiddleware,
  forgotPasswordRouteRateLimitMiddleware,
  handlers: authHandlers
});

app.get('/api/auth/csrf-token', bootstrapStatusRouteRateLimitMiddleware, csrfRuntime.issueTokenHandler);

registerAdminRoutes({
  app,
  requirePermission,
  PERMISSIONS,
  pool,
  handleDbError,
  badRequest,
  isValidEmail,
  getRoleIdByName,
  getAdminUserIds,
  adminUserManagementRouteRateLimitMiddleware,
  createOpaqueToken,
  hashOpaqueToken,
  replaceUserProjectScope,
  sendSmtpTestEmail,
  adminAuditRouteRateLimitMiddleware,
  createUserInvite,
  resolveSmtpSettingsRow,
  sendSmtpEmail,
  buildInviteEmailBody,
  resolveBootstrapAdminId,
  redactSmtpSettings,
  encryptSmtpPassword
});

app.get('/api/meta', metaRouteRateLimitMiddleware, async (_req, res) => {
  try {
    const [priorities, trades, levels, statuses] = await Promise.all([
      pool.query('SELECT id, name, color_hex, sort_order FROM priorities ORDER BY sort_order, id'),
      pool.query('SELECT id, name FROM trades ORDER BY name'),
      pool.query('SELECT id, name FROM levels ORDER BY sort_order, id'),
      pool.query('SELECT status_key, label, color_hex, sort_order FROM project_statuses ORDER BY sort_order, status_key')
    ]);

    res.json({
      priorities: priorities.rows,
      trades: trades.rows,
      levels: levels.rows,
      projectStatuses: (statuses?.rows || []).map((row) => ({ key: row.status_key, label: row.label, colorHex: row.color_hex, sortOrder: Number(row.sort_order || 0) }))
    });
  } catch (error) {
    handleDbError(res, error);
  }
});

// Register modular domains and keep app.js focused on shared middleware/composition.
registerModuleRoutes(app, {
  pool,
  badRequest,
  handleDbError,
  parseOptionalBoolean,
  parseWorkingHours,
  requirePermission,
  PERMISSIONS,
  requireMonth,
  normalizeProjectStatus,
  isScopedTeammate,
  canAccessProjectById,
  getChallengeProjectId,
  getAssignmentProjectContext,
  getPersonProjectTotalQuantity,
  distributeProjectQuantityAcrossAssignments,
  projectsMutationRouteRateLimitMiddleware,
  assignmentsMutationRouteRateLimitMiddleware
});

// Legacy project/challenge/assignment endpoints are registered via src/modules/projects.

// Data portability endpoints (export/import) use stricter permissions.
app.get('/api/export', requirePermission(PERMISSIONS.EXPORT_RUN), exportRouteRateLimitMiddleware, async (req, res) => {
  try {
    const [clients, projects, people, challenges, assignments] = await Promise.all([
      pool.query('SELECT id, name, location, since_month, priority_id FROM clients ORDER BY id'),
      pool.query('SELECT id, client_id, name, status, start_month, end_month, budget_cents FROM projects ORDER BY id'),
      pool.query(
        `SELECT p.id, p.first_name, p.last_name, t.name AS trade, l.name AS level,
                COALESCE(p.is_hidden, FALSE) AS is_hidden, COALESCE(p.is_leaver, FALSE) AS is_leaver, p.status, p.working_hours
         FROM people p
         JOIN trades t ON p.trade_id = t.id
         JOIN levels l ON p.level_id = l.id
         ORDER BY p.id`
      ),
      pool.query('SELECT id, project_id, title, description FROM challenges ORDER BY id'),
      pool.query('SELECT id, project_id, challenge_id, person_id, is_owner, is_leader, quantity FROM assignments ORDER BY id')
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      data: {
        clients: clients.rows,
        projects: projects.rows,
        people: people.rows,
        challenges: challenges.rows,
        assignments: assignments.rows
      }
    };

    if ((req.query.format || '').toLowerCase() === 'csv') {
      const csv = payloadToCsv(payload.data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="projectory-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }

    return res.json(payload);
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.get('/api/export/config', requirePermission(PERMISSIONS.EXPORT_RUN), exportConfigRouteRateLimitMiddleware, async (req, res) => {
  try {
    const [trades, levels] = await Promise.all([
      pool.query('SELECT id, name FROM trades ORDER BY name'),
      pool.query('SELECT id, name FROM levels ORDER BY sort_order, id')
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      data: {
        trades: trades.rows,
        levels: levels.rows
      }
    };

    if ((req.query.format || '').toLowerCase() === 'csv') {
      const csv = configurationPayloadToCsv(payload.data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="projectory-configuration-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }

    return res.json(payload);
  } catch (error) {
    return handleDbError(res, error);
  }
});

function normalizeConfigurationItems(list, label) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }

  const normalized = list
    .map((item) => {
      if (typeof item === 'string') {
        return { id: null, name: item };
      }
      return {
        id: Number.isInteger(Number(item?.id)) ? Number(item.id) : null,
        name: item?.name,
        colorHex: item?.colorHex ?? item?.color_hex,
        sortOrder: item?.sortOrder ?? item?.sort_order,
        key: item?.key
      };
    })
    .map((item) => ({
      id: item.id,
      name: String(item.name || '').trim(),
      colorHex: item.colorHex,
      sortOrder: item.sortOrder,
      key: item.key
    }))
    .filter((item) => item.name);

  if (normalized.length === 0) {
    throw new Error(`${label} must contain at least one non-empty value.`);
  }

  if (new Set(normalized.map((value) => value.name.toLowerCase())).size !== normalized.length) {
    throw new Error(`${label} contains duplicate values.`);
  }

  const ids = normalized.filter((item) => Number.isInteger(item.id) && item.id > 0).map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} contains duplicate ids.`);
  }

  return normalized;
}


const PORTABILITY_SCOPES = new Set(['people', 'clients', 'projects', 'configuration', 'access-audit']);

function normalizePortabilityScope(scope) {
  const normalized = String(scope || '').trim().toLowerCase();
  return PORTABILITY_SCOPES.has(normalized) ? normalized : '';
}

function summarizeScopedPayload(scope, payload) {
  if (scope === 'people') return { people: (payload.people || []).length };
  if (scope === 'clients') return { clients: (payload.clients || []).length };
  if (scope === 'projects') return { projects: (payload.projects || []).length, challenges: (payload.challenges || []).length, assignments: (payload.assignments || []).length };
  if (scope === 'configuration') return { trades: (payload.trades || []).length, levels: (payload.levels || []).length, priorities: (payload.priorities || []).length, projectStatuses: (payload.projectStatuses || []).length };
  return { users: (payload.users || []).length, userRoles: (payload.userRoles || []).length, userProjectAccess: (payload.userProjectAccess || []).length, userInvites: (payload.userInvites || []).length, auditLog: (payload.auditLog || []).length, smtpSettings: (payload.smtpSettings || []).length };
}

function scopedPayloadToCsv(payload) {
  const entities = Object.keys(payload || {});
  const headers = new Set(['entity']);
  for (const entity of entities) {
    for (const row of payload[entity] || []) {
      Object.keys(row || {}).forEach((key) => headers.add(key));
    }
  }
  const orderedHeaders = [...headers];
  const rows = [orderedHeaders.map(csvEscape).join(';')];
  for (const entity of entities) {
    for (const row of payload[entity] || []) {
      const mapped = orderedHeaders.map((header) => {
        if (header === 'entity') return entity;
        return row?.[header];
      });
      rows.push(mapped.map(csvEscape).join(';'));
    }
  }
  return rows.join('\n');
}

function csvToScopedPayload(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('CSV file is empty.');
  const headers = rows[0];
  if (!headers.includes('entity')) throw new Error('CSV missing required header: entity');
  const payload = {};
  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i];
    if (line.every((cell) => !String(cell).trim())) continue;
    const record = {};
    for (let h = 0; h < headers.length; h += 1) {
      record[headers[h]] = line[h] ?? '';
    }
    const entity = String(record.entity || '').trim();
    if (!entity) continue;
    delete record.entity;
    payload[entity] = payload[entity] || [];
    payload[entity].push(record);
  }
  return payload;
}

async function buildScopedExportPayload(scope) {
  if (scope === 'people') {
    const people = await pool.query(
      `SELECT p.id, p.first_name, p.last_name, p.trade_id, t.name AS trade, p.level_id, l.name AS level,
              COALESCE(p.is_hidden, FALSE) AS is_hidden, COALESCE(p.is_leaver, FALSE) AS is_leaver, p.status, p.working_hours
       FROM people p
       JOIN trades t ON t.id = p.trade_id
       JOIN levels l ON l.id = p.level_id
       ORDER BY p.id`
    );
    return { people: people.rows };
  }
  if (scope === 'clients') {
    const clients = await pool.query('SELECT id, name, location, since_month, priority_id FROM clients ORDER BY id');
    return { clients: clients.rows };
  }
  if (scope === 'projects') {
    const [projects, challenges, assignments] = await Promise.all([
      pool.query('SELECT id, client_id, name, status, start_month, end_month, budget_cents FROM projects ORDER BY id'),
      pool.query('SELECT id, project_id, title, description FROM challenges ORDER BY id'),
      pool.query('SELECT id, project_id, challenge_id, person_id, is_owner, is_leader, quantity FROM assignments ORDER BY id')
    ]);
    return { projects: projects.rows, challenges: challenges.rows, assignments: assignments.rows };
  }
  if (scope === 'configuration') {
    const [trades, levels, priorities, statuses] = await Promise.all([
      pool.query('SELECT id, name FROM trades ORDER BY id'),
      pool.query('SELECT id, name, sort_order FROM levels ORDER BY sort_order, id'),
      pool.query('SELECT id, name, color_hex, sort_order FROM priorities ORDER BY sort_order, id'),
      pool.query('SELECT status_key, label, color_hex, sort_order FROM project_statuses ORDER BY sort_order, status_key')
    ]);
    return { trades: trades.rows, levels: levels.rows, priorities: priorities.rows, projectStatuses: statuses.rows };
  }

  const [users, userRoles, userProjectAccess, userInvites, smtpSettings, auditLog] = await Promise.all([
    pool.query('SELECT id, email, display_name, is_active, person_id, password_hash, last_login_at, failed_login_count, locked_until, created_at FROM users ORDER BY id'),
    pool.query('SELECT ur.user_id, r.name AS role_name FROM user_roles ur JOIN roles r ON r.id = ur.role_id ORDER BY ur.user_id, r.name'),
    pool.query('SELECT user_id, project_id FROM user_project_access ORDER BY user_id, project_id'),
    pool.query('SELECT id, user_id, token_hash, expires_at, accepted_at, invited_by_user_id, created_at FROM user_invites ORDER BY id'),
    pool.query('SELECT id, host, port, username, password, from_email, secure, enabled, updated_at FROM smtp_settings ORDER BY id'),
    pool.query('SELECT id, actor_user_id, actor_role, action, entity_type, entity_id, status_code, request_path, ip_address, user_agent, metadata_json, created_at FROM audit_log ORDER BY id')
  ]);
  return { users: users.rows, userRoles: userRoles.rows, userProjectAccess: userProjectAccess.rows, userInvites: userInvites.rows, smtpSettings: smtpSettings.rows, auditLog: auditLog.rows };
}

app.get('/api/export/:scope', requirePermission(PERMISSIONS.EXPORT_RUN), exportRouteRateLimitMiddleware, async (req, res) => {
  const scope = normalizePortabilityScope(req.params.scope);
  if (!scope) return badRequest(res, 'Unsupported export scope.');
  try {
    const data = await buildScopedExportPayload(scope);
    const payload = { exportedAt: new Date().toISOString(), version: 2, scope, data };
    if ((req.query.format || '').toLowerCase() === 'csv') {
      const csv = scopedPayloadToCsv(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="projectory-${scope}-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }
    return res.json(payload);
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/import/:scope/preview', requirePermission(PERMISSIONS.IMPORT_RUN), importPreviewRouteRateLimitMiddleware, async (req, res) => {
  const scope = normalizePortabilityScope(req.params.scope);
  if (!scope) return badRequest(res, 'Unsupported import scope.');
  const format = String(req.body?.format || '').toLowerCase();
  try {
    let data;
    if (format === 'json') {
      data = req.body?.data;
      if (!data) return badRequest(res, 'Import payload must contain a data object.');
    } else if (format === 'csv') {
      const content = req.body?.content;
      if (typeof content !== 'string') return badRequest(res, 'CSV preview requires a content string.');
      data = csvToScopedPayload(content);
    } else {
      return badRequest(res, 'Unsupported import format.');
    }
    return res.json({ ok: true, scope, summary: summarizeScopedPayload(scope, data), data });
  } catch (error) {
    return badRequest(res, error.message || 'Invalid import payload.');
  }
});

app.post('/api/import/:scope', requirePermission(PERMISSIONS.IMPORT_RUN), importRouteExpressRateLimitMiddleware, importRouteRateLimitMiddleware, async (req, res) => {
  const scope = normalizePortabilityScope(req.params.scope);
  if (!scope) return badRequest(res, 'Unsupported import scope.');
  const data = req.body?.data;
  if (!data) return badRequest(res, 'Import payload must contain a data object.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (scope === 'people') {
      const payload = { people: (data.people || []).map((row) => ({ ...row, id: parseCsvInteger(row.id), trade_id: parseCsvInteger(row.trade_id), level_id: parseCsvInteger(row.level_id), is_hidden: parseCsvBoolean(row.is_hidden), is_leaver: parseCsvBoolean(row.is_leaver), working_hours: parseCsvInteger(row.working_hours) })), clients: [], projects: [], challenges: [], assignments: [] };
      const err = await normalizeImportPeople(payload);
      if (err) throw new Error(err);
      await client.query('DELETE FROM people');
      for (const row of payload.people) {
        await client.query('INSERT INTO people (id, first_name, last_name, trade_id, level_id, is_hidden, is_leaver, status, working_hours) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [row.id, row.first_name, row.last_name, row.trade_id, row.level_id, Boolean(row.is_hidden), Boolean(row.is_leaver), normalizePeopleStatus(row.status), row.working_hours || 40]);
      }
    } else if (scope === 'clients') {
      for (const row of (data.clients || [])) {
        await client.query(
          `INSERT INTO clients (id, name, location, since_month, priority_id)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, location=EXCLUDED.location, since_month=EXCLUDED.since_month, priority_id=EXCLUDED.priority_id`,
          [parseCsvInteger(row.id), row.name, row.location, row.since_month, parseCsvInteger(row.priority_id)]
        );
      }
    } else if (scope === 'projects') {
      await client.query('DELETE FROM assignments');
      await client.query('DELETE FROM challenges');
      await client.query('DELETE FROM projects');
      for (const row of (data.projects || [])) {
        await client.query('INSERT INTO projects (id, client_id, name, status, start_month, end_month, budget_cents) VALUES ($1,$2,$3,$4,$5,$6,$7)', [parseCsvInteger(row.id), parseCsvInteger(row.client_id), row.name, normalizeProjectStatus(row.status), row.start_month, row.end_month || null, parseCsvInteger(row.budget_cents)]);
      }
      for (const row of (data.challenges || [])) {
        await client.query('INSERT INTO challenges (id, project_id, title, description) VALUES ($1,$2,$3,$4)', [parseCsvInteger(row.id), parseCsvInteger(row.project_id), row.title, row.description]);
      }
      for (const row of (data.assignments || [])) {
        await client.query('INSERT INTO assignments (id, project_id, challenge_id, person_id, is_owner, is_leader, quantity) VALUES ($1,$2,$3,$4,$5,$6,$7)', [parseCsvInteger(row.id), parseCsvInteger(row.project_id), parseCsvInteger(row.challenge_id), parseCsvInteger(row.person_id), parseCsvBoolean(row.is_owner), parseCsvBoolean(row.is_leader), parseCsvNumber(row.quantity)]);
      }
    } else if (scope === 'configuration') {
      await applyConfigurationCatalog({
        trades: data.trades,
        levels: (data.levels || []).map((row) => ({ ...row, sortOrder: parseCsvInteger(row.sort_order || row.sortOrder) })),
        priorities: (data.priorities || []).map((row) => ({ ...row, colorHex: row.color_hex || row.colorHex, sortOrder: parseCsvInteger(row.sort_order || row.sortOrder) })),
        projectStatuses: (data.projectStatuses || []).map((row) => ({ key: row.status_key || row.key, name: row.label || row.name, colorHex: row.color_hex || row.colorHex, sortOrder: parseCsvInteger(row.sort_order || row.sortOrder) }))
      });
    } else {
      for (const row of (data.users || [])) {
        await client.query(
          `INSERT INTO users (id, email, display_name, is_active, person_id, password_hash, last_login_at, failed_login_count, locked_until, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name, is_active=EXCLUDED.is_active, person_id=EXCLUDED.person_id, password_hash=EXCLUDED.password_hash, last_login_at=EXCLUDED.last_login_at, failed_login_count=EXCLUDED.failed_login_count, locked_until=EXCLUDED.locked_until`,
          [parseCsvInteger(row.id), row.email, row.display_name, parseCsvBoolean(row.is_active), parseCsvInteger(row.person_id), row.password_hash || null, row.last_login_at || null, parseCsvInteger(row.failed_login_count) || 0, row.locked_until || null, row.created_at || new Date().toISOString()]
        );
      }
      await client.query('DELETE FROM user_roles');
      for (const row of (data.userRoles || [])) {
        const roleLookup = await client.query('SELECT id FROM roles WHERE LOWER(name)=LOWER($1) LIMIT 1', [row.role_name || row.role]);
        if (roleLookup.rowCount) {
          await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [parseCsvInteger(row.user_id), roleLookup.rows[0].id]);
        }
      }
      await client.query('DELETE FROM user_project_access');
      for (const row of (data.userProjectAccess || [])) {
        await client.query('INSERT INTO user_project_access (user_id, project_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [parseCsvInteger(row.user_id), parseCsvInteger(row.project_id)]);
      }
      await client.query('DELETE FROM user_invites');
      for (const row of (data.userInvites || [])) {
        await client.query('INSERT INTO user_invites (id, user_id, token_hash, expires_at, accepted_at, invited_by_user_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [parseCsvInteger(row.id), parseCsvInteger(row.user_id), row.token_hash, row.expires_at, row.accepted_at || null, parseCsvInteger(row.invited_by_user_id), row.created_at || new Date().toISOString()]);
      }
      if ((data.smtpSettings || []).length > 0) {
        await client.query('DELETE FROM smtp_settings');
        for (const row of data.smtpSettings) {
          await client.query('INSERT INTO smtp_settings (id, host, port, username, password, from_email, secure, enabled, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [parseCsvInteger(row.id), row.host || null, parseCsvInteger(row.port), row.username || null, row.password || null, row.from_email || null, parseCsvBoolean(row.secure), parseCsvBoolean(row.enabled), row.updated_at || new Date().toISOString()]);
        }
      }
      if ((data.auditLog || []).length > 0) {
        await client.query('DELETE FROM audit_log');
        for (const row of data.auditLog) {
          await client.query('INSERT INTO audit_log (id, actor_user_id, actor_role, action, entity_type, entity_id, status_code, request_path, ip_address, user_agent, metadata_json, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)', [parseCsvInteger(row.id), parseCsvInteger(row.actor_user_id), row.actor_role || null, row.action, row.entity_type || null, parseCsvInteger(row.entity_id), parseCsvInteger(row.status_code), row.request_path || null, row.ip_address || null, row.user_agent || null, row.metadata_json || '{}', row.created_at || new Date().toISOString()]);
        }
      }
    }

    await client.query('COMMIT');
    return res.json({ ok: true, scope, summary: summarizeScopedPayload(scope, data) });
  } catch (error) {
    await client.query('ROLLBACK');
    return badRequest(res, error.message || 'Invalid import payload.');
  } finally {
    client.release();
  }
});

app.get('/api/configuration', requirePermission(PERMISSIONS.ADMIN_ACCESS), configurationRouteRateLimitMiddleware, async (_req, res) => {
  try {
    const [trades, levels, priorities, projectStatuses] = await Promise.all([
      pool.query(
        `SELECT t.id, t.name, COUNT(p.id)::int AS usage_count
         FROM trades t
         LEFT JOIN people p ON p.trade_id = t.id
         GROUP BY t.id, t.name
         ORDER BY t.name`
      ),
      pool.query(
        `SELECT l.id, l.name, l.sort_order, COUNT(p.id)::int AS usage_count
         FROM levels l
         LEFT JOIN people p ON p.level_id = l.id
         GROUP BY l.id, l.name, l.sort_order
         ORDER BY l.sort_order, l.id`
      ),
      pool.query(
        `SELECT pr.id, pr.name, pr.color_hex, pr.sort_order, COUNT(c.id)::int AS usage_count
         FROM priorities pr
         LEFT JOIN clients c ON c.priority_id = pr.id
         GROUP BY pr.id, pr.name, pr.color_hex, pr.sort_order
         ORDER BY pr.sort_order, pr.id`
      ),
      pool.query(
        `SELECT ps.status_key, ps.label, ps.color_hex, ps.sort_order, COUNT(p.id)::int AS usage_count
         FROM project_statuses ps
         LEFT JOIN projects p ON p.status = ps.status_key
         GROUP BY ps.status_key, ps.label, ps.color_hex, ps.sort_order
         ORDER BY ps.sort_order, ps.status_key`
      )
    ]);

    return res.json({
      trades: trades.rows,
      levels: levels.rows.map((row) => ({
        id: row.id,
        name: row.name,
        sortOrder: Number(row.sort_order || 0),
        usage_count: Number(row.usage_count || 0)
      })),
      priorities: priorities.rows,
      projectStatuses: projectStatuses.rows.map((row) => ({
        key: row.status_key,
        label: row.label,
        colorHex: row.color_hex,
        sortOrder: Number(row.sort_order || 0),
        usage_count: Number(row.usage_count || 0)
      }))
    });
  } catch (error) {
    return handleDbError(res, error);
  }
});

async function applyConfigurationCatalog({ trades, levels, priorities, projectStatuses }) {
  const nextTrades = normalizeConfigurationItems(trades, 'trades');
  const nextLevels = normalizeConfigurationItems(levels, 'levels').map((item, index) => ({ ...item, sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index + 1 }));
  const nextPriorities = normalizeConfigurationItems(priorities, 'priorities').map((item, index) => ({ ...item, colorHex: String(item.colorHex || item.color_hex || '#64748B').trim() || '#64748B', sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index + 1 }));
  const nextProjectStatuses = normalizeConfigurationItems(projectStatuses, 'projectStatuses').map((item, index) => ({ key: String(item.key || '').trim().toLowerCase() || `status_${Date.now()}_${index}`, label: item.name, colorHex: String(item.colorHex || '#64748B').trim() || '#64748B', sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index + 1 }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const [existingTrades, existingLevels, existingPriorities, existingStatuses] = await Promise.all([
      client.query(
        `SELECT t.id, t.name, COUNT(p.id)::int AS usage_count
         FROM trades t
         LEFT JOIN people p ON p.trade_id = t.id
         GROUP BY t.id, t.name`
      ),
      client.query(
        `SELECT l.id, l.name, l.sort_order, COUNT(p.id)::int AS usage_count
         FROM levels l
         LEFT JOIN people p ON p.level_id = l.id
         GROUP BY l.id, l.name, l.sort_order`
      ),
      client.query(
        `SELECT pr.id, pr.name, pr.color_hex, pr.sort_order, COUNT(c.id)::int AS usage_count
         FROM priorities pr
         LEFT JOIN clients c ON c.priority_id = pr.id
         GROUP BY pr.id, pr.name, pr.color_hex, pr.sort_order`
      ),
      client.query(
        `SELECT ps.status_key, ps.label, ps.color_hex, ps.sort_order, COUNT(p.id)::int AS usage_count
         FROM project_statuses ps
         LEFT JOIN projects p ON p.status = ps.status_key
         GROUP BY ps.status_key, ps.label, ps.color_hex, ps.sort_order`
      )
    ]);

    const tradeById = new Map(existingTrades.rows.map((row) => [Number(row.id), row]));
    const levelById = new Map(existingLevels.rows.map((row) => [Number(row.id), row]));

    for (const item of nextTrades) {
      if (item.id && !tradeById.has(item.id)) {
        throw new Error(`Trade id '${item.id}' does not exist.`);
      }
    }
    for (const item of nextLevels) {
      if (item.id && !levelById.has(item.id)) {
        throw new Error(`Level id '${item.id}' does not exist.`);
      }
    }

    const nextTradeIds = new Set(nextTrades.filter((item) => item.id).map((item) => item.id));
    for (const row of existingTrades.rows) {
      const rowId = Number(row.id);
      if (!nextTradeIds.has(rowId) && Number(row.usage_count || 0) > 0) {
        throw new Error(`Trade '${row.name}' is in use and cannot be removed.`);
      }
    }

    const nextLevelIds = new Set(nextLevels.filter((item) => item.id).map((item) => item.id));
    for (const row of existingLevels.rows) {
      const rowId = Number(row.id);
      if (!nextLevelIds.has(rowId) && Number(row.usage_count || 0) > 0) {
        throw new Error(`Level '${row.name}' is in use and cannot be removed.`);
      }
    }

    for (const item of nextTrades.filter((item) => item.id)) {
      await client.query('UPDATE trades SET name = $1 WHERE id = $2', [item.name, item.id]);
    }
    for (const item of nextLevels.filter((item) => item.id)) {
      await client.query('UPDATE levels SET name = $1, sort_order = $2 WHERE id = $3', [item.name, item.sortOrder, item.id]);
    }

    const deleteTradeIds = existingTrades.rows
      .map((row) => Number(row.id))
      .filter((id) => !nextTradeIds.has(id));
    const deleteLevelIds = existingLevels.rows
      .map((row) => Number(row.id))
      .filter((id) => !nextLevelIds.has(id));

    if (deleteTradeIds.length > 0) {
      await client.query('DELETE FROM trades WHERE id = ANY($1::int[])', [deleteTradeIds]);
    }
    if (deleteLevelIds.length > 0) {
      await client.query('DELETE FROM levels WHERE id = ANY($1::int[])', [deleteLevelIds]);
    }

    const newTradeNames = nextTrades.filter((item) => !item.id).map((item) => item.name);
    const newLevels = nextLevels.filter((item) => !item.id);

    if (newTradeNames.length > 0) {
      await client.query(
        `INSERT INTO trades (name)
         SELECT value FROM UNNEST($1::text[]) AS value`,
        [newTradeNames]
      );
    }
    for (const item of newLevels) {
      await client.query('INSERT INTO levels (name, sort_order) VALUES ($1, $2)', [item.name, item.sortOrder]);
    }


    const priorityById = new Map(existingPriorities.rows.map((row) => [Number(row.id), row]));
    for (const item of nextPriorities) {
      if (item.id && !priorityById.has(item.id)) {
        throw new Error(`Priority id '${item.id}' does not exist.`);
      }
    }
    const nextPriorityIds = new Set(nextPriorities.filter((item) => item.id).map((item) => item.id));
    for (const row of existingPriorities.rows) {
      const rowId = Number(row.id);
      if (!nextPriorityIds.has(rowId) && Number(row.usage_count || 0) > 0) {
        throw new Error(`Priority '${row.name}' is in use and cannot be removed.`);
      }
    }
    for (const item of nextPriorities.filter((item) => item.id)) {
      await client.query('UPDATE priorities SET name = $1, color_hex = $2, sort_order = $3 WHERE id = $4', [item.name, item.colorHex, item.sortOrder, item.id]);
    }
    const deletePriorityIds = existingPriorities.rows.map((row) => Number(row.id)).filter((id) => !nextPriorityIds.has(id));
    if (deletePriorityIds.length > 0) {
      await client.query('DELETE FROM priorities WHERE id = ANY($1::int[])', [deletePriorityIds]);
    }
    for (const item of nextPriorities.filter((item) => !item.id)) {
      await client.query('INSERT INTO priorities (name, color_hex, sort_order) VALUES ($1, $2, $3)', [item.name, item.colorHex, item.sortOrder]);
    }

    const statusByKey = new Map(existingStatuses.rows.map((row) => [String(row.status_key), row]));
    const nextStatusKeys = new Set(nextProjectStatuses.map((item) => item.key));
    for (const row of existingStatuses.rows) {
      const key = String(row.status_key);
      if (!nextStatusKeys.has(key) && Number(row.usage_count || 0) > 0) {
        throw new Error(`Status '${row.label}' is in use and cannot be removed.`);
      }
    }
    for (const item of nextProjectStatuses) {
      if (statusByKey.has(item.key)) {
        await client.query('UPDATE project_statuses SET label = $1, color_hex = $2, sort_order = $3, updated_at = NOW() WHERE status_key = $4', [item.label, item.colorHex, item.sortOrder, item.key]);
      } else {
        await client.query('INSERT INTO project_statuses (status_key, label, color_hex, sort_order) VALUES ($1, $2, $3, $4)', [item.key, item.label, item.colorHex, item.sortOrder]);
      }
    }
    const deleteStatusKeys = existingStatuses.rows.map((row) => String(row.status_key)).filter((key) => !nextStatusKeys.has(key));
    if (deleteStatusKeys.length > 0) {
      await client.query('DELETE FROM project_statuses WHERE status_key = ANY($1::text[])', [deleteStatusKeys]);
    }

    await client.query('COMMIT');
    return { trades: nextTrades.length, levels: nextLevels.length, priorities: nextPriorities.length, projectStatuses: nextProjectStatuses.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

app.put('/api/configuration', requirePermission(PERMISSIONS.ADMIN_ACCESS), configurationRouteRateLimitMiddleware, configurationMutationRouteRateLimitMiddleware, async (req, res) => {
  try {
    await applyConfigurationCatalog({ trades: req.body?.trades, levels: req.body?.levels, priorities: req.body?.priorities, projectStatuses: req.body?.projectStatuses });
    return res.json({ ok: true });
  } catch (error) {
    return badRequest(res, error.message || 'Invalid configuration payload.');
  }
});

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function ensureNoDuplicateIds(rows, entityName) {
  const ids = rows.map((row) => row.id);
  if (new Set(ids).size !== ids.length) {
    return `${entityName} contains duplicate ids.`;
  }
  return null;
}

function validateImportPayload(payload) {
  const requiredArrays = ['clients', 'projects', 'people', 'challenges', 'assignments'];
  for (const key of requiredArrays) {
    if (!Array.isArray(payload[key])) {
      return `Import payload missing array: ${key}`;
    }
  }

  const duplicateChecks = [
    ['clients', payload.clients],
    ['projects', payload.projects],
    ['people', payload.people],
    ['challenges', payload.challenges],
    ['assignments', payload.assignments]
  ];

  for (const [entityName, rows] of duplicateChecks) {
    const duplicateError = ensureNoDuplicateIds(rows, entityName);
    if (duplicateError) {
      return duplicateError;
    }
  }

  const clientIds = new Set(payload.clients.map((row) => row.id));
  const projectIds = new Set(payload.projects.map((row) => row.id));
  const peopleIds = new Set(payload.people.map((row) => row.id));
  const challengeIds = new Set(payload.challenges.map((row) => row.id));

  for (const row of payload.clients) {
    if (!isPositiveInteger(row.id) || !row.name || !row.location || !MONTH_REGEX.test(row.since_month || '') || !isPositiveInteger(row.priority_id)) {
      return `Invalid client row with id ${row.id}.`;
    }
  }

  for (const row of payload.projects) {
    if (!isPositiveInteger(row.id) || !clientIds.has(row.client_id) || !row.name || !MONTH_REGEX.test(row.start_month || '') || !isNonNegativeInteger(row.budget_cents)) {
      return `Invalid project row with id ${row.id}.`;
    }

    if (!String(row.status || '').trim()) {
      return `Invalid project status in project id ${row.id}.`;
    }

    if (row.end_month && !MONTH_REGEX.test(row.end_month)) {
      return `Invalid end_month in project id ${row.id}.`;
    }
  }

  for (const row of payload.people) {
    if (!isPositiveInteger(row.id) || !row.first_name || !row.last_name || !isPositiveInteger(row.trade_id) || !isPositiveInteger(row.level_id)) {
      return `Invalid person row with id ${row.id}.`;
    }

    if (row.is_hidden !== undefined && row.is_hidden !== null && typeof row.is_hidden !== 'boolean') {
      return `Invalid is_hidden flag in person row with id ${row.id}.`;
    }

    if (row.is_leaver !== undefined && row.is_leaver !== null && typeof row.is_leaver !== 'boolean') {
      return `Invalid is_leaver flag in person row with id ${row.id}.`;
    }

    if (row.working_hours !== undefined && row.working_hours !== null && !isPositiveInteger(row.working_hours)) {
      return `Invalid working_hours in person row with id ${row.id}.`;
    }

    if (row.status !== undefined && row.status !== null && !PEOPLE_STATUS_VALUES.includes(String(row.status).toLowerCase())) {
      return `Invalid status in person row with id ${row.id}.`;
    }
  }

  for (const row of payload.challenges) {
    if (!isPositiveInteger(row.id) || !projectIds.has(row.project_id) || !row.title || !row.description) {
      return `Invalid challenge row with id ${row.id}.`;
    }
  }

  for (const row of payload.assignments) {
    if (!isPositiveInteger(row.id) || !projectIds.has(row.project_id) || !challengeIds.has(row.challenge_id) || !peopleIds.has(row.person_id)) {
      return `Invalid assignment row with id ${row.id}.`;
    }

    if (typeof row.is_owner !== 'boolean' || typeof row.is_leader !== 'boolean' || (row.is_owner && row.is_leader)) {
      return `Invalid owner/leader flags in assignment id ${row.id}.`;
    }

    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 100) {
      return `Invalid quantity in assignment id ${row.id}.`;
    }
  }

  const challengeProjectMap = new Map(payload.challenges.map((row) => [row.id, row.project_id]));
  for (const row of payload.assignments) {
    if (challengeProjectMap.get(row.challenge_id) !== row.project_id) {
      return `Assignment id ${row.id} links challenge to a different project.`;
    }
  }

  return null;
}

async function normalizeImportPeople(payload) {
  const { tradeByName, levelByName } = await getPeopleCatalogLookups();

  for (const row of payload.people) {
    let tradeId = isPositiveInteger(row.trade_id) ? Number(row.trade_id) : null;
    let levelId = isPositiveInteger(row.level_id) ? Number(row.level_id) : null;

    if (!tradeId && row.trade) {
      tradeId = tradeByName.get(String(row.trade).trim().toUpperCase()) || null;
      if (!tradeId) return `Invalid trade '${row.trade}' in person id ${row.id}.`;
    }

    if (!levelId && row.level) {
      levelId = levelByName.get(String(row.level).trim().toUpperCase()) || null;
      if (!levelId) return `Invalid level '${row.level}' in person id ${row.id}.`;
    }

    if (!tradeId || !levelId) {
      return `Invalid person row with id ${row.id}.`;
    }

    row.trade_id = tradeId;
    row.level_id = levelId;
    row.working_hours = isPositiveInteger(row.working_hours) ? Number(row.working_hours) : 40;
    row.status = normalizePeopleStatus(row.status);
  }

  return null;
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  if (raw.includes('"') || raw.includes(';') || raw.includes(',') || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function payloadToCsv(payload) {
  const headers = [
    'entity', 'id', 'client_id', 'project_id', 'challenge_id', 'person_id', 'name', 'location', 'since_month', 'priority_id',
    'status', 'start_month', 'end_month', 'budget_cents', 'first_name', 'last_name', 'trade', 'level', 'is_hidden', 'is_leaver', 'person_status', 'working_hours', 'title', 'description',
    'is_owner', 'is_leader', 'quantity'
  ];

  const rows = [headers.join(';')];

  function pushRow(entity, row) {
    const values = headers.map((header) => {
      if (header === 'entity') return entity;
      if (entity === 'people' && header === 'person_status') return row.status;
      return row[header];
    });
    rows.push(values.map(csvEscape).join(';'));
  }

  payload.clients.forEach((row) => pushRow('clients', row));
  payload.projects.forEach((row) => pushRow('projects', row));
  payload.people.forEach((row) => pushRow('people', row));
  payload.challenges.forEach((row) => pushRow('challenges', row));
  payload.assignments.forEach((row) => pushRow('assignments', row));

  return rows.join('\n');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ';') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error('CSV parse error: unclosed quote.');
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseCsvBoolean(value) {
  if (value === 'true' || value === 'TRUE' || value === '1') return true;
  if (value === 'false' || value === 'FALSE' || value === '0') return false;
  return null;
}

function parseCsvInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

function parseCsvNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function csvToPayload(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const headers = rows[0];
  const requiredHeaders = ['entity', 'id'];
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`CSV missing required header: ${header}`);
    }
  }

  const payload = {
    clients: [],
    projects: [],
    people: [],
    challenges: [],
    assignments: []
  };

  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i];
    if (line.every((cell) => !String(cell).trim())) {
      continue;
    }

    const record = {};
    for (let h = 0; h < headers.length; h += 1) {
      record[headers[h]] = line[h] ?? '';
    }

    const entity = (record.entity || '').trim();
    if (!payload[entity]) {
      throw new Error(`CSV contains unknown entity '${entity}' on row ${i + 1}.`);
    }

    if (entity === 'clients') {
      payload.clients.push({
        id: parseCsvInteger(record.id),
        name: record.name,
        location: record.location,
        since_month: record.since_month,
        priority_id: parseCsvInteger(record.priority_id)
      });
    } else if (entity === 'projects') {
      payload.projects.push({
        id: parseCsvInteger(record.id),
        client_id: parseCsvInteger(record.client_id),
        name: record.name,
        status: normalizeProjectStatus(record.status),
        start_month: record.start_month,
        end_month: record.end_month || null,
        budget_cents: parseCsvInteger(record.budget_cents)
      });
    } else if (entity === 'people') {
      payload.people.push({
        id: parseCsvInteger(record.id),
        first_name: record.first_name,
        last_name: record.last_name,
        trade: record.trade,
        level: record.level,
        trade_id: parseCsvInteger(record.trade_id),
        level_id: parseCsvInteger(record.level_id),
        is_hidden: parseCsvBoolean(record.is_hidden),
        is_leaver: parseCsvBoolean(record.is_leaver),
        status: normalizePeopleStatus(record.person_status || record.status),
        working_hours: parseCsvInteger(record.working_hours)
      });
    } else if (entity === 'challenges') {
      payload.challenges.push({
        id: parseCsvInteger(record.id),
        project_id: parseCsvInteger(record.project_id),
        title: record.title,
        description: record.description
      });
    } else if (entity === 'assignments') {
      payload.assignments.push({
        id: parseCsvInteger(record.id),
        project_id: parseCsvInteger(record.project_id),
        challenge_id: parseCsvInteger(record.challenge_id),
        person_id: parseCsvInteger(record.person_id),
        is_owner: parseCsvBoolean(record.is_owner),
        is_leader: parseCsvBoolean(record.is_leader),
        quantity: parseCsvNumber(record.quantity)
      });
    }
  }

  return payload;
}

function configurationPayloadToCsv(payload) {
  const rows = ['entity;id;name'];
  (payload.trades || []).forEach((row) => rows.push([csvEscape('trades'), csvEscape(row.id), csvEscape(row.name)].join(';')));
  (payload.levels || []).forEach((row) => rows.push([csvEscape('levels'), csvEscape(row.id), csvEscape(row.name)].join(';')));
  return rows.join('\n');
}

function csvToConfigurationPayload(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const headers = rows[0];
  if (!headers.includes('entity') || !headers.includes('name')) {
    throw new Error('CSV missing required headers: entity,name');
  }

  const payload = { trades: [], levels: [] };
  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i];
    if (line.every((cell) => !String(cell).trim())) continue;

    const record = {};
    for (let h = 0; h < headers.length; h += 1) {
      record[headers[h]] = line[h] ?? '';
    }

    const entity = String(record.entity || '').trim().toLowerCase();
    if (!['trades', 'levels'].includes(entity)) {
      throw new Error(`CSV contains unknown entity '${entity}' on row ${i + 1}.`);
    }

    payload[entity].push({ id: parseCsvInteger(record.id), name: String(record.name || '').trim() });
  }

  return payload;
}

function summarizeConfigurationPayload(payload) {
  return {
    trades: (payload.trades || []).length,
    levels: (payload.levels || []).length
  };
}

function summarizeImportPayload(payload) {
  return {
    clients: payload.clients.length,
    projects: payload.projects.length,
    people: payload.people.length,
    challenges: payload.challenges.length,
    assignments: payload.assignments.length
  };
}

app.post('/api/import/preview', requirePermission(PERMISSIONS.IMPORT_RUN), importPreviewRouteRateLimitMiddleware, async (req, res) => {
  const format = String(req.body?.format || '').toLowerCase();

  try {
    let payload;
    if (format === 'json') {
      payload = req.body?.data;
      if (!payload) return badRequest(res, 'Import payload must contain a data object.');
    } else if (format === 'csv') {
      const content = req.body?.content;
      if (typeof content !== 'string') return badRequest(res, 'CSV preview requires a content string.');
      payload = csvToPayload(content);
    } else {
      return badRequest(res, 'Unsupported import format.');
    }

    for (const project of payload.projects) {
      project.status = normalizeProjectStatus(project.status);
    }

    const normalizationError = await normalizeImportPeople(payload);
    if (normalizationError) return badRequest(res, normalizationError);

    const validationError = validateImportPayload(payload);
    if (validationError) return badRequest(res, validationError);

    return res.json({
      ok: true,
      summary: summarizeImportPayload(payload),
      data: payload
    });
  } catch (error) {
    return badRequest(res, error.message || 'Invalid import payload.');
  }
});

app.post('/api/import/config/preview', requirePermission(PERMISSIONS.IMPORT_RUN), importPreviewRouteRateLimitMiddleware, async (req, res) => {
  const format = String(req.body?.format || '').toLowerCase();

  try {
    let payload;
    if (format === 'json') {
      payload = req.body?.data;
      if (!payload) return badRequest(res, 'Import payload must contain a data object.');
    } else if (format === 'csv') {
      const content = req.body?.content;
      if (typeof content !== 'string') return badRequest(res, 'CSV preview requires a content string.');
      payload = csvToConfigurationPayload(content);
    } else {
      return badRequest(res, 'Unsupported import format.');
    }

    const trades = normalizeConfigurationItems(payload.trades, 'trades');
    const levels = normalizeConfigurationItems(payload.levels, 'levels');

    return res.json({
      ok: true,
      summary: summarizeConfigurationPayload({ trades, levels }),
      data: { trades, levels }
    });
  } catch (error) {
    return badRequest(res, error.message || 'Invalid import payload.');
  }
});

app.post('/api/import/config', requirePermission(PERMISSIONS.IMPORT_RUN), importConfigRouteRateLimitMiddleware, async (req, res) => {
  try {
    const summary = await applyConfigurationCatalog({
      trades: req.body?.data?.trades,
      levels: req.body?.data?.levels
    });
    return res.json({ ok: true, summary });
  } catch (error) {
    return badRequest(res, error.message || 'Invalid import payload.');
  }
});

app.post('/api/import', requirePermission(PERMISSIONS.IMPORT_RUN), importRouteExpressRateLimitMiddleware, importRouteRateLimitMiddleware, async (req, res) => {
  const payload = req.body?.data;

  if (!payload) {
    return badRequest(res, 'Import payload must contain a data object.');
  }

  for (const project of payload.projects) {
    project.status = normalizeProjectStatus(project.status);
  }

  const normalizationError = await normalizeImportPeople(payload);
  if (normalizationError) {
    return badRequest(res, normalizationError);
  }

  const validationError = validateImportPayload(payload);
  if (validationError) {
    return badRequest(res, validationError);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM assignments');
    await client.query('DELETE FROM challenges');
    await client.query('DELETE FROM projects');
    await client.query('DELETE FROM people');
    await client.query('DELETE FROM clients');

    for (const row of payload.clients) {
      await client.query(
        'INSERT INTO clients (id, name, location, since_month, priority_id) VALUES ($1, $2, $3, $4, $5)',
        [row.id, row.name, row.location, row.since_month, row.priority_id]
      );
    }

    for (const row of payload.projects) {
      await client.query(
        'INSERT INTO projects (id, client_id, name, status, start_month, end_month, budget_cents) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [row.id, row.client_id, row.name, normalizeProjectStatus(row.status), row.start_month, row.end_month || null, row.budget_cents]
      );
    }

    for (const row of payload.people) {
      await client.query(
        'INSERT INTO people (id, first_name, last_name, trade_id, level_id, is_hidden, is_leaver, status, working_hours) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [row.id, row.first_name, row.last_name, row.trade_id, row.level_id, row.is_hidden ?? null, row.is_leaver ?? null, normalizePeopleStatus(row.status), row.working_hours ?? 40]
      );
    }

    for (const row of payload.challenges) {
      await client.query(
        'INSERT INTO challenges (id, project_id, title, description) VALUES ($1, $2, $3, $4)',
        [row.id, row.project_id, row.title, row.description]
      );
    }

    for (const row of payload.assignments) {
      await client.query(
        `INSERT INTO assignments (id, project_id, challenge_id, person_id, is_owner, is_leader, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.project_id, row.challenge_id, row.person_id, row.is_owner, row.is_leader, row.quantity]
      );
    }

    const sequenceTables = ['clients', 'projects', 'people', 'challenges', 'assignments'];
    for (const table of sequenceTables) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`
      );
    }

    await client.query('COMMIT');
    return res.json({ ok: true, summary: summarizeImportPayload(payload) });
  } catch (error) {
    await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    client.release();
  }
});


app.get(['/teams', '/teams/:id', '/people', '/people/:id', '/admin', '/admin/:tab', '/invite', '/reset-password'], spaShellRouteRateLimitMiddleware, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});


registerObservabilityRoutes({
  app,
  pool,
  renderPrometheusMetrics
});

app.use((error, _req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large.' });
  }

  if (error instanceof SyntaxError && error?.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }

  return next(error);
});

async function startServer() {
  return startServerRuntime({
    validateAuthRuntimeSafety,
    validateRuntimeEnvironment,
    cleanupAuditLogRetention,
    cleanupAuthLifecycleArtifacts,
    incrementCleanupFailure: () => incrementCounter(metricsState.authLifecycleCleanupRunsTotal, 'failure', 1),
    cleanupIntervalMs: AUTH_LIFECYCLE_CLEANUP_INTERVAL_MS,
    app,
    port
  });
}

module.exports = {
  app,
  startServer,
  pool,
  getAuthMode,
  validateAuthRuntimeSafety,
  validateRuntimeEnvironment,
  clearRequestRateLimitBuckets,
  clearAuthAttemptBuckets,
  clearMetrics,
  cleanupAuthLifecycleArtifacts,
  parseTrustProxySetting,
  resolveTrustProxySetting,
  shouldUseSecureSessionCookie,
  serializeSessionCookie,
  clearSessionCookie
};
