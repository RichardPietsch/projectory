const express = require('express');
const path = require('path');
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { registerModuleRoutes } = require('./modules');
const { attachAuthContext, requirePermission } = require('./auth/middleware');
const { PERMISSIONS, getPermissionsForRole } = require('./auth/permissions');
const { validatePasswordStrength, hashPassword, verifyPassword } = require('./auth/passwords');
const { createOpaqueToken, hashOpaqueToken } = require('./auth/tokens');

// Single Express app serving API + static frontend.
const app = express();
const port = process.env.PORT || 3000;

// Shared Postgres connection pool used across modules/routes.
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'helloapp',
  user: process.env.DB_USER || 'hello',
  password: process.env.DB_PASSWORD || 'hello'
});

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const TRADE_CATALOG = [
  'UX', 'UI', 'DATA', 'STRATEGY', 'CONSULTING', 'DEV-FE', 'DEV-BE', 'DEV-FULLSTACK', 'DEV-OPS',
  'ART', 'COPY', 'CREATIVE', 'IT', 'HR', 'ACCOUNT', 'PO', 'TPM', 'MANAGEMENT', 'ADMIN', 'CONTROLLING',
  'TEMP', 'STUDENT'
];

const LEVEL_CATALOG = ['—', 'JUNIOR', 'MIDWEIGHT', 'SENIOR', 'DIRECTOR', 'C-LEVEL'];
const PROJECT_STATUS_VALUES = ['green', 'blue', 'yellow', 'red', 'white'];
const PEOPLE_STATUS_VALUES = ['active', 'paused', 'leaver'];
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '100kb';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
const CORRELATION_ID_HEADER = 'x-correlation-id';
const requestRateBuckets = new Map();
const RATE_LIMIT_BUCKET_SWEEP_INTERVAL_MS = 30000;
const AUTH_ATTEMPT_SWEEP_INTERVAL_MS = 30000;
const SMTP_PASSWORD_PREFIX = 'enc:v1:';
const METRIC_DURATION_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
let lastRateLimitBucketSweepAt = 0;
const authAttemptBuckets = new Map();
const routeRateLimitBuckets = new Map();
let lastAuthAttemptSweepAt = 0;

const metricsState = {
  requestsTotal: new Map(),
  requestDurationBuckets: new Map(),
  requestDurationCount: new Map(),
  requestDurationSumMs: new Map(),
  requestErrorsTotal: new Map(),
  authFailuresTotal: new Map(),
  dbQueryDurationBuckets: new Map(),
  dbQueryDurationCount: 0,
  dbQueryDurationSumMs: 0,
  dbQueryErrorsTotal: 0
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



function clearRequestRateLimitBuckets() {
  requestRateBuckets.clear();
  lastRateLimitBucketSweepAt = 0;
}

function sweepExpiredRateLimitBuckets(now, windowMs) {
  if (now - lastRateLimitBucketSweepAt < RATE_LIMIT_BUCKET_SWEEP_INTERVAL_MS) {
    return;
  }

  for (const [ipKey, bucket] of requestRateBuckets.entries()) {
    if (now - bucket.windowStart >= windowMs) {
      requestRateBuckets.delete(ipKey);
    }
  }

  lastRateLimitBucketSweepAt = now;
}

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

  const dbDuration = ['# HELP projectory_db_query_duration_ms Database query duration in milliseconds.', '# TYPE projectory_db_query_duration_ms histogram'];
  for (const [key, value] of metricsState.dbQueryDurationBuckets.entries()) {
    dbDuration.push(`projectory_db_query_duration_ms_bucket{le="${escapePrometheusLabel(key.replace('le=', ''))}"} ${value}`);
  }
  dbDuration.push(`projectory_db_query_duration_ms_count ${metricsState.dbQueryDurationCount}`);
  dbDuration.push(`projectory_db_query_duration_ms_sum ${metricsState.dbQueryDurationSumMs}`);
  sections.push(dbDuration.join('\n'));

  sections.push(`# HELP projectory_db_query_errors_total Database query failures.\n# TYPE projectory_db_query_errors_total counter\nprojectory_db_query_errors_total ${metricsState.dbQueryErrorsTotal}`);

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



function getRateLimitConfig() {
  const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const defaultMax = isProduction ? 120 : 10000;
  const max = Number(process.env.REQUEST_RATE_LIMIT_MAX || defaultMax);
  const windowMs = Number(process.env.REQUEST_RATE_LIMIT_WINDOW_MS || 60000);
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

  return (req, res, next) => {
    const now = Date.now();
    const actorKey = String(keyGenerator(req) || 'unknown');
    const bucketKey = `${keyPrefix}|${actorKey}`;
    const bucket = routeRateLimitBuckets.get(bucketKey);

    if (!bucket || now - bucket.windowStart >= windowMs) {
      routeRateLimitBuckets.set(bucketKey, { windowStart: now, count: 1 });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterMs = Math.max(1, windowMs - (now - bucket.windowStart));
      res.setHeader('Retry-After', String(toRetryAfterSeconds(retryAfterMs)));
      return res.status(429).json({ error: message });
    }

    return next();
  };
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  const correlationId = getCorrelationIdFromHeader(req);
  req.correlationId = correlationId;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  next();
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://cdn.tailwindcss.com https://code.iconify.design; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});
function requestRateLimitMiddleware(req, res, next) {
  const { max, windowMs } = getRateLimitConfig();
  const now = Date.now();
  sweepExpiredRateLimitBuckets(now, windowMs);
  const ipKey = String(req.ip || req.socket?.remoteAddress || 'unknown');
  const bucket = requestRateBuckets.get(ipKey);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    requestRateBuckets.set(ipKey, { windowStart: now, count: 1 });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return res.status(429).json({ error: 'Too many requests.' });
  }

  return next();
}


const forgotPasswordRouteRateLimitMiddleware = rateLimit({
  keyPrefix: 'auth-forgot-password',
  max: Number(process.env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX || 10),
  windowMs: Number(process.env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS || 60000),
  message: 'Too many password reset requests. Please wait before trying again.',
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
    return `${ip}|${email || 'unknown'}`;
  }
});

const spaShellRouteRateLimitMiddleware = rateLimit({
  keyPrefix: 'spa-shell',
  max: Number(process.env.SPA_SHELL_RATE_LIMIT_MAX || 240),
  windowMs: Number(process.env.SPA_SHELL_RATE_LIMIT_WINDOW_MS || 60000),
  message: 'Too many page requests. Please slow down.'
});

app.use(requestRateLimitMiddleware);

app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout.' });
    }
  });
  next();
});
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  const normalizedPath = normalizeMetricPath(req.path);
  emitStructuredLog('info', 'request.start', {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
    ipHash: obfuscateSecurityKey(req.ip || req.socket?.remoteAddress || 'unknown'),
    userAgent: req.header('user-agent') || null,
    requestHeaders: req.path.startsWith('/api/') ? (req.headers || {}) : undefined,
    requestBody: req.path.startsWith('/api/') ? (req.body || {}) : undefined
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
});
app.use(attachAuthContext);
app.use(express.static(path.join(__dirname, '..', 'public')));

const AUTH_SESSION_COOKIE = 'projectory_session';
const AUTH_SESSION_TTL_HOURS = Number(process.env.AUTH_SESSION_TTL_HOURS || 12);
const PASSWORD_RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);
const AUDIT_LOG_RETENTION_MONTHS = Number(process.env.AUDIT_LOG_RETENTION_MONTHS || 6);

const AUTH_MODES = new Set(['hybrid', 'session', 'header']);

function getAuthMode() {
  const mode = String(process.env.AUTH_MODE || 'hybrid').trim().toLowerCase();
  return AUTH_MODES.has(mode) ? mode : 'hybrid';
}

function validateAuthRuntimeSafety() {
  const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const authMode = getAuthMode();
  if (isProduction && authMode !== 'session') {
    throw new Error(`Unsafe auth configuration: AUTH_MODE=${authMode}. Production requires AUTH_MODE=session.`);
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
  const secureAttribute = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${AUTH_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureAttribute}`;
}

function clearSessionCookie() {
  const secureAttribute = process.env.NODE_ENV === 'production' ? '; Secure' : '';
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

function normalizeProjectStatus(status, fallback = 'white') {
  const normalized = String(status || '').trim().toLowerCase();
  if (PROJECT_STATUS_VALUES.includes(normalized)) return normalized;
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


async function ensurePriorityCatalog() {
  const targetPriorities = [
    '⭐️ Hero',
    '✨ Rising Star',
    '☑️ Solid',
    '🛠️ Maintenance',
    '🔬 Small Client',
    '❌ Outphasing'
  ];

  const legacyToTarget = [
    ['Prio 1', '⭐️ Hero'],
    ['Prio 2', '✨ Rising Star'],
    ['Prio 3', '☑️ Solid'],
    ['Prio 4', '🛠️ Maintenance']
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [legacyName, targetName] of legacyToTarget) {
      await client.query(
        `UPDATE priorities
         SET name = $1
         WHERE name = $2
           AND NOT EXISTS (SELECT 1 FROM priorities p2 WHERE p2.name = $1)`,
        [targetName, legacyName]
      );
    }

    await client.query(
      `INSERT INTO priorities (name)
       SELECT value
       FROM UNNEST($1::text[]) AS value
       ON CONFLICT (name) DO NOTHING`,
      [targetPriorities]
    );

    const byName = await client.query(
      `SELECT id, name FROM priorities WHERE name = ANY($1::text[])`,
      [[...targetPriorities, ...legacyToTarget.map(([legacy]) => legacy)]]
    );
    const idByName = new Map(byName.rows.map((row) => [row.name, row.id]));

    for (const [legacyName, targetName] of legacyToTarget) {
      const legacyId = idByName.get(legacyName);
      const targetId = idByName.get(targetName);
      if (legacyId && targetId && legacyId !== targetId) {
        await client.query(
          `UPDATE clients
           SET priority_id = $1
           WHERE priority_id = $2`,
          [targetId, legacyId]
        );
      }
    }

    await client.query(
      `DELETE FROM priorities p
       WHERE p.name = ANY($1::text[])
         AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.priority_id = p.id)`,
      [legacyToTarget.map(([legacyName]) => legacyName)]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ensurePeopleCatalog() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO trades (name)
       SELECT value
       FROM UNNEST($1::text[]) AS value
       ON CONFLICT (name) DO NOTHING`,
      [TRADE_CATALOG]
    );

    await client.query(
      `INSERT INTO levels (name)
       SELECT value
       FROM UNNEST($1::text[]) AS value
       ON CONFLICT (name) DO NOTHING`,
      [LEVEL_CATALOG]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ensureProjectStatusColumn() {
  await pool.query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'white'
    CHECK (status IN ('green', 'blue', 'yellow', 'red', 'white'))
  `);
}

async function ensurePeopleFlagsColumns() {
  await pool.query(`
    ALTER TABLE people
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN
  `);

  await pool.query(`
    ALTER TABLE people
    ADD COLUMN IF NOT EXISTS is_leaver BOOLEAN
  `);
}


async function ensurePeopleStatusColumn() {
  await pool.query(`
    ALTER TABLE people
    ADD COLUMN IF NOT EXISTS status TEXT
  `);

  await pool.query(`
    UPDATE people
    SET status = CASE
      WHEN COALESCE(is_leaver, FALSE) THEN 'leaver'
      ELSE 'active'
    END
    WHERE status IS NULL
  `);

  await pool.query(`
    ALTER TABLE people
    ALTER COLUMN status SET DEFAULT 'active'
  `);

  await pool.query(`
    ALTER TABLE people
    ALTER COLUMN status SET NOT NULL
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'people_status_allowed'
      ) THEN
        ALTER TABLE people
        ADD CONSTRAINT people_status_allowed CHECK (status IN ('active', 'paused', 'leaver'));
      END IF;
    END $$;
  `);
}

async function ensurePeopleWorkingHoursColumn() {
  await pool.query(`
    ALTER TABLE people
    ADD COLUMN IF NOT EXISTS working_hours INTEGER NOT NULL DEFAULT 40
  `);

  await pool.query('UPDATE people SET working_hours = 40 WHERE working_hours IS NULL');
}

async function getPeopleCatalogLookups(client = pool) {
  const [trades, levels] = await Promise.all([
    client.query('SELECT id, name FROM trades ORDER BY name'),
    client.query('SELECT id, name FROM levels ORDER BY name')
  ]);

  return {
    tradeByName: new Map(trades.rows.map((row) => [String(row.name).toUpperCase(), row.id])),
    levelByName: new Map(levels.rows.map((row) => [String(row.name).toUpperCase(), row.id]))
  };
}


app.get('/api/auth/me', (req, res) => {
  res.json({
    userId: req.auth.userId,
    email: req.auth.email,
    displayName: req.auth.displayName,
    personId: req.auth.personId || null,
    role: req.auth.role,
    roles: req.auth.roles || [req.auth.role],
    permissions: req.auth.permissions,
    authSource: req.auth.authSource || 'header',
    scopedProjectIds: req.auth.scopedProjectIds || [],
    isScopedTeammate: Boolean(req.auth.isScopedTeammate),
    authMode: getAuthMode()
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return badRequest(res, 'email and password are required.');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const securityKey = buildAuthThrottleKey('login', { ip: req.ip || 'unknown', identifier: normalizedEmail || 'unknown' });
  const authConfig = getAuthProtectionConfig();
  const preflight = getAuthThrottleState(securityKey, authConfig);
  if (preflight.throttled) {
    emitAuthSecurityEvent('auth_login_throttled', {
      endpoint: '/api/auth/login',
      ipHash: obfuscateSecurityKey(req.ip || 'unknown'),
      identifierHash: obfuscateSecurityKey(normalizedEmail),
      failureCount: preflight.failureCount,
      retryAfterMs: preflight.retryAfterMs,
      lockout: preflight.locked
    });
    return sendAuthThrottle(res, 'Invalid email or password.', preflight.retryAfterMs);
  }

  try {
    const userResult = await pool.query(
      `SELECT id, email, display_name, person_id, password_hash, is_active
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [normalizedEmail]
    );

    const user = userResult.rowCount > 0 ? userResult.rows[0] : null;
    const isValid = user?.password_hash ? await verifyPassword(password, user.password_hash) : false;

    if (!user || !user.is_active || !isValid) {
      const fail = registerAuthFailure(securityKey, authConfig);
      emitAuthSecurityEvent('auth_login_failed', {
        endpoint: '/api/auth/login',
        ipHash: obfuscateSecurityKey(req.ip || 'unknown'),
        identifierHash: obfuscateSecurityKey(normalizedEmail),
        userFound: Boolean(user),
        active: Boolean(user?.is_active),
        failureCount: fail.failures,
        retryAfterMs: fail.retryAfterMs,
        lockout: fail.locked
      });
      return sendAuthFailure(res, 401, 'Invalid email or password.');
    }

    const sessionId = createOpaqueToken(48);
    const expiresAt = new Date(Date.now() + (AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000));

    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, user.id, expiresAt.toISOString(), req.ip || null, req.header('user-agent') || null]
    );

    await pool.query(
      `UPDATE users
       SET failed_login_count = 0,
           locked_until = NULL,
           last_login_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    clearAuthFailureState(securityKey);
    res.setHeader('Set-Cookie', serializeSessionCookie(sessionId, expiresAt));
    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const sessionId = parseCookieHeader(req.headers.cookie).get(AUTH_SESSION_COOKIE);
    if (sessionId) {
      await pool.query(
        `UPDATE auth_sessions
         SET revoked_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );
    }
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/auth/forgot-password', forgotPasswordRouteRateLimitMiddleware, async (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!email) {
    return badRequest(res, 'email is required.');
  }

  try {
    const userResult = await pool.query(
      `SELECT id, email, display_name
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND is_active = TRUE
       LIMIT 1`,
      [email]
    );

    if (userResult.rowCount > 0) {
      const user = userResult.rows[0];
      const reset = await createPasswordResetToken(user.id, req.ip || null);

      const smtpResult = await pool.query(
        `SELECT host, port, username, password, from_email, secure, enabled
         FROM smtp_settings
         WHERE id = 1`
      );
      const smtp = smtpResult.rows[0] ? await resolveSmtpSettingsRow(smtpResult.rows[0], { persistLegacyUpgrade: true }) : null;

      if (smtp && smtp.enabled && smtp.host && smtp.port && smtp.from_email) {
        try {
          await sendSmtpEmail(smtp, {
            toEmail: String(user.email || '').trim().toLowerCase(),
            subject: 'Projectory password reset',
            textBody: buildForgotPasswordEmailBody({ resetLink: reset.resetLink, expiresMinutes: reset.expiresMinutes })
          });
        } catch (error) {
          emitAuthSecurityEvent('auth_password_reset_email_failed', {
            endpoint: '/api/auth/forgot-password',
            ipHash: obfuscateSecurityKey(req.ip || 'unknown'),
            identifierHash: obfuscateSecurityKey(email),
            reason: String(error?.message || 'unknown')
          });
        }
      }

      if (process.env.AUTH_RETURN_DEBUG_TOKENS === 'true') {
        return res.json({ ok: true, debugToken: reset.token, resetLink: reset.resetLink });
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || !password) {
    return badRequest(res, 'token and password are required.');
  }

  const validationError = validatePasswordStrength(password);
  if (validationError) {
    return badRequest(res, validationError);
  }

  const tokenHash = hashOpaqueToken(token);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (tokenResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    const passwordHash = await hashPassword(password);

    await client.query(
      `UPDATE users
       SET password_hash = $1,
           failed_login_count = 0,
           locked_until = NULL
       WHERE id = $2`,
      [passwordHash, tokenResult.rows[0].user_id]
    );

    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [tokenResult.rows[0].id]
    );

    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    if (client) client.release();
  }
});


app.post('/api/auth/invite-preview', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) {
    return badRequest(res, 'token is required.');
  }

  try {
    const tokenHash = hashOpaqueToken(token);
    const result = await pool.query(
      `SELECT u.id AS user_id, u.email, u.display_name, ui.expires_at
       FROM user_invites ui
       JOIN users u ON u.id = ui.user_id
       WHERE ui.token_hash = $1
         AND ui.accepted_at IS NULL
         AND ui.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid or expired invite token.' });
    }

    const invite = result.rows[0];
    return res.json({
      ok: true,
      user: {
        email: invite.email,
        displayName: invite.display_name,
        expiresAt: invite.expires_at
      }
    });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/auth/accept-invite', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || !password) {
    return badRequest(res, 'token and password are required.');
  }

  const validationError = validatePasswordStrength(password);
  if (validationError) {
    return badRequest(res, validationError);
  }

  const throttleKey = buildAuthThrottleKey('accept-invite', { ip: req.ip || 'unknown', identifier: token });
  const authConfig = getAuthProtectionConfig();
  const preflight = getAuthThrottleState(throttleKey, authConfig);
  if (preflight.throttled) {
    emitAuthSecurityEvent('auth_invite_accept_throttled', {
      endpoint: '/api/auth/accept-invite',
      ipHash: obfuscateSecurityKey(req.ip || 'unknown'),
      tokenHash: obfuscateSecurityKey(token),
      failureCount: preflight.failureCount,
      retryAfterMs: preflight.retryAfterMs,
      lockout: preflight.locked
    });
    return sendAuthThrottle(res, 'Invite activation failed.', preflight.retryAfterMs);
  }

  const tokenHash = hashOpaqueToken(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inviteResult = await client.query(
      `SELECT id, user_id
       FROM user_invites
       WHERE token_hash = $1
         AND accepted_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (inviteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      const fail = registerAuthFailure(throttleKey, authConfig);
      emitAuthSecurityEvent('auth_invite_accept_failed', {
        endpoint: '/api/auth/accept-invite',
        ipHash: obfuscateSecurityKey(req.ip || 'unknown'),
        tokenHash: obfuscateSecurityKey(token),
        failureCount: fail.failures,
        retryAfterMs: fail.retryAfterMs,
        lockout: fail.locked,
        reason: 'invalid_token'
      });
      return sendAuthFailure(res, 400, 'Invite activation failed.');
    }

    const passwordHash = await hashPassword(password);
    await client.query(
      `UPDATE users
       SET password_hash = $1,
           is_active = TRUE,
           failed_login_count = 0,
           locked_until = NULL
       WHERE id = $2`,
      [passwordHash, inviteResult.rows[0].user_id]
    );

    await client.query(
      `UPDATE user_invites
       SET accepted_at = NOW()
       WHERE id = $1`,
      [inviteResult.rows[0].id]
    );

    const userInfo = await client.query(`SELECT email, display_name FROM users WHERE id = $1 LIMIT 1`, [inviteResult.rows[0].user_id]);

    await client.query('COMMIT');
    clearAuthFailureState(throttleKey);
    return res.json({ ok: true, email: userInfo.rows[0]?.email || null, displayName: userInfo.rows[0]?.display_name || null });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    if (client) client.release();
  }
});


app.get('/api/admin/users', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id,
              u.email,
              u.display_name,
              u.is_active,
              u.person_id,
              u.password_hash,
              u.last_login_at,
              p.first_name,
              p.last_name,
              NULL::text AS person_email,
              COALESCE(ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles,
              latest_invite.id AS latest_invite_id,
              latest_invite.created_at AS latest_invited_at,
              latest_invite.expires_at AS latest_invite_expires_at,
              latest_invite.accepted_at AS latest_invite_accepted_at
       FROM users u
       LEFT JOIN people p ON p.id = u.person_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN LATERAL (
         SELECT id, created_at, expires_at, accepted_at
         FROM user_invites ui
         WHERE ui.user_id = u.id
         ORDER BY ui.created_at DESC
         LIMIT 1
       ) latest_invite ON TRUE
       GROUP BY u.id, u.email, u.display_name, u.is_active, u.person_id, u.password_hash, u.last_login_at,
                p.first_name, p.last_name,
                latest_invite.id, latest_invite.created_at, latest_invite.expires_at, latest_invite.accepted_at
       ORDER BY u.created_at DESC, u.id DESC`
    );

    return res.json(result.rows.map((row) => {
      const hasInvite = Boolean(row.latest_invited_at);
      const inviteAccepted = Boolean(row.latest_invite_accepted_at);
      const inviteExpired = hasInvite && !inviteAccepted && new Date(row.latest_invite_expires_at).getTime() <= Date.now();
      const status = !row.is_active
        ? 'inactive'
        : inviteAccepted
          ? 'active'
          : inviteExpired
            ? 'invite_expired'
            : hasInvite
              ? 'invited'
              : row.password_hash
                ? 'active'
                : 'provisioned';

      return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        isActive: row.is_active,
        personId: row.person_id,
        personName: row.person_id ? `${row.first_name || ''} ${row.last_name || ''}`.trim() : null,
        personEmail: row.person_email || null,
        roles: row.roles || [],
        status,
        hasPassword: Boolean(row.password_hash),
        lastLoginAt: row.last_login_at || null,
        latestInvitedAt: row.latest_invited_at || null,
        latestInviteExpiresAt: row.latest_invite_expires_at || null,
        latestInviteAcceptedAt: row.latest_invite_accepted_at || null,
        latestInviteId: row.latest_invite_id || null,
        canRevokeInvite: status === 'invited'
      };
    }));
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/admin/users', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const { email, displayName, role, personId, isActive } = req.body || {};

  if (!isValidEmail(email)) {
    return badRequest(res, 'Valid email is required.');
  }

  if (!displayName || !String(displayName).trim()) {
    return badRequest(res, 'displayName is required.');
  }

  try {
    const selectedRole = await getRoleIdByName(role || 'viewer');
    if (!selectedRole) {
      return badRequest(res, 'role must reference an existing role.');
    }
    const insert = await pool.query(
      `INSERT INTO users (email, display_name, person_id, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [String(email).trim().toLowerCase(), String(displayName).trim(), personId || null, isActive !== false]
    );

    await pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [insert.rows[0].id, selectedRole.id]
    );

    return res.status(201).json({ id: insert.rows[0].id });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.put('/api/admin/users/:id', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const { email, displayName, role, personId, isActive } = req.body || {};
  if (!displayName || !String(displayName).trim()) {
    return badRequest(res, 'displayName is required.');
  }

  if (!isValidEmail(email)) {
    return badRequest(res, 'Valid email is required.');
  }

  let client = null;
  try {
    const selectedRole = await getRoleIdByName(role || 'viewer');
    if (!selectedRole) {
      return badRequest(res, 'role must reference an existing role.');
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE users
       SET email = $1,
           display_name = $2,
           person_id = $3,
           is_active = $4
       WHERE id = $5`,
      [String(email).trim().toLowerCase(), String(displayName).trim(), personId || null, isActive !== false, req.params.id]
    );

    if (updated.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found.' });
    }

    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [req.params.id]);
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.params.id, selectedRole.id]
    );

    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    return handleDbError(res, error);
  } finally {
    if (client) client.release();
  }
});

app.delete('/api/admin/users/:id', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  try {
    if (req.auth?.userId && Number(req.params.id) === Number(req.auth.userId)) {
      return res.status(409).json({ error: 'You cannot delete your own account.' });
    }

    const deleted = await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    if (deleted.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.post('/api/admin/users/:id/invite', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const expiresHours = Number(req.body?.expiresHours || 72);
  if (!Number.isFinite(expiresHours) || expiresHours < 1 || expiresHours > 168) {
    return badRequest(res, 'expiresHours must be between 1 and 168.');
  }

  try {
    const userResult = await pool.query(
      `SELECT id, email, is_active
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.params.id]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (!userResult.rows[0].is_active) {
      return res.status(409).json({ error: 'Cannot invite an inactive user.' });
    }

    const invite = await createUserInvite(userResult.rows[0].id, req.auth.userId, expiresHours);

    const smtpResult = await pool.query(
      `SELECT host, port, username, password, from_email, secure, enabled
       FROM smtp_settings
       WHERE id = 1`
    );
    const smtp = smtpResult.rows[0] ? await resolveSmtpSettingsRow(smtpResult.rows[0], { persistLegacyUpgrade: true }) : null;

    if (!smtp || !smtp.enabled || !smtp.host || !smtp.port || !smtp.from_email) {
      return res.status(409).json({ error: 'SMTP is not configured. Configure SMTP settings before sending invites.' });
    }


    await sendSmtpEmail(smtp, {
      toEmail: String(userResult.rows[0].email || '').trim(),
      subject: 'Projectory account invitation',
      textBody: buildInviteEmailBody({
        inviteLink: invite.inviteLink,
        recipientName: userResult.rows[0].email,
        expiresHours
      })
    });

    return res.json({
      ok: true,
      deliveryStatus: 'sent',
      inviteLink: process.env.AUTH_RETURN_DEBUG_TOKENS === 'true' ? invite.inviteLink : undefined,
      inviteToken: process.env.AUTH_RETURN_DEBUG_TOKENS === 'true' ? invite.token : undefined
    });
  } catch (error) {
    return handleDbError(res, error);
  }
});


app.post('/api/admin/users/:id/invite/revoke', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  try {
    const revoked = await pool.query(
      `UPDATE user_invites
       SET expires_at = NOW()
       WHERE user_id = $1
         AND accepted_at IS NULL
         AND expires_at > NOW()`,
      [req.params.id]
    );

    if (revoked.rowCount === 0) {
      return res.status(404).json({ error: 'No active invite to revoke for this user.' });
    }

    return res.json({ ok: true, revoked: revoked.rowCount });
  } catch (error) {
    return handleDbError(res, error);
  }
});


app.get('/api/admin/users/:id/project-access', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT project_id
       FROM user_project_access
       WHERE user_id = $1
       ORDER BY project_id`,
      [req.params.id]
    );

    return res.json({
      userId: Number(req.params.id),
      projectIds: result.rows.map((row) => Number(row.project_id))
    });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.put('/api/admin/users/:id/project-access', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const projectIds = Array.isArray(req.body?.projectIds) ? req.body.projectIds : null;
  if (!projectIds) {
    return badRequest(res, 'projectIds must be an array.');
  }

  try {
    const userResult = await pool.query(
      `SELECT id FROM users WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Persist full replacement to keep admin UX predictable.
    const normalized = await replaceUserProjectScope(req.params.id, projectIds);
    return res.json({ ok: true, projectIds: normalized });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.get('/api/admin/smtp-settings', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT host, port, username, password, from_email, secure, enabled
       FROM smtp_settings
       WHERE id = 1`
    );

    const resolved = await resolveSmtpSettingsRow(result.rows[0] || {}, { persistLegacyUpgrade: true });
    return res.json(redactSmtpSettings(resolved));
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.put('/api/admin/smtp-settings', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const { host, port, username, password, fromEmail, secure, enabled } = req.body || {};

  if (enabled && (!host || !port || !fromEmail)) {
    return badRequest(res, 'host, port and fromEmail are required when SMTP is enabled.');
  }

  if (fromEmail && !isValidEmail(fromEmail)) {
    return badRequest(res, 'fromEmail must be a valid email address.');
  }

  try {
    await pool.query(
      `UPDATE smtp_settings
       SET host = $1,
           port = $2,
           username = $3,
           password = COALESCE($4, password),
           from_email = $5,
           secure = $6,
           enabled = $7,
           updated_at = NOW()
       WHERE id = 1`,
      [host || null, port || null, username || null, password ? encryptSmtpPassword(password) : null, fromEmail || null, secure !== false, Boolean(enabled)]
    );

    const refreshed = await pool.query(
      `SELECT host, port, username, password, from_email, secure, enabled
       FROM smtp_settings
       WHERE id = 1`
    );

    const resolved = await resolveSmtpSettingsRow(refreshed.rows[0] || {}, { persistLegacyUpgrade: true });
    return res.json(redactSmtpSettings(resolved));
  } catch (error) {
    return handleDbError(res, error);
  }
});



app.post('/api/admin/smtp-settings/test-email', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const toEmail = String(req.body?.toEmail || '').trim();
  const dryRun = Boolean(req.body?.dryRun);

  if (!isValidEmail(toEmail)) {
    return badRequest(res, 'toEmail must be a valid email address.');
  }

  try {
    const current = await pool.query(
      `SELECT host, port, username, password, from_email, secure, enabled
       FROM smtp_settings
       ORDER BY id DESC
       LIMIT 1`
    );

    const smtp = current.rows[0] ? await resolveSmtpSettingsRow(current.rows[0], { persistLegacyUpgrade: true }) : null;
    if (!smtp || !smtp.enabled) {
      return badRequest(res, 'SMTP must be enabled before sending test email.');
    }

    if (!smtp.host || !smtp.port || !smtp.from_email) {
      return badRequest(res, 'SMTP host, port and fromEmail are required.');
    }

    if (!dryRun) {
      await sendSmtpTestEmail(smtp, toEmail);
    }

    return res.json({ ok: true, toEmail, dryRun });
  } catch (error) {
    const reason = String(error?.message || 'Unknown SMTP failure');
    const hint = /AUTH|535|5\.7\./i.test(reason)
      ? 'Check SMTP auth mode/app password and whether the provider requires OAuth/app-specific passwords.'
      : /STARTTLS|TLS|SSL|certificate|alert/i.test(reason)
        ? 'Check secure setting vs port (465 implicit TLS, 587 STARTTLS) and certificate trust.'
        : /RCPT TO|550|553|recipient/i.test(reason)
          ? 'Verify the test recipient address is accepted by the SMTP provider.'
          : 'Check host/port reachability and provider restrictions.';
    return res.status(502).json({ error: `SMTP test failed: ${reason}`, hint });
  }
});

app.get('/api/admin/audit', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit || '100', 10) || 100, 500));
  const actorUserId = req.query.actorUserId ? Number.parseInt(req.query.actorUserId, 10) : null;
  const entityType = String(req.query.entityType || '').trim();
  const action = String(req.query.action || '').trim();

  try {
    const result = await pool.query(
      `SELECT id, actor_user_id, actor_role, action, entity_type, entity_id, status_code, request_path, ip_address, user_agent, metadata_json, created_at
       FROM audit_log
       WHERE ($1::int IS NULL OR actor_user_id = $1)
         AND ($2::text = '' OR entity_type = $2)
         AND ($3::text = '' OR action ILIKE ('%' || $3 || '%'))
       ORDER BY created_at DESC
       LIMIT $4`,
      [Number.isInteger(actorUserId) ? actorUserId : null, entityType, action, limit]
    );

    return res.json({ entries: result.rows });
  } catch (error) {
    return handleDbError(res, error);
  }
});

app.get('/api/meta', async (_req, res) => {
  try {
    const [priorities, trades, levels] = await Promise.all([
      pool.query('SELECT id, name FROM priorities ORDER BY id'),
      pool.query('SELECT id, name FROM trades ORDER BY name'),
      pool.query('SELECT id, name FROM levels ORDER BY name')
    ]);

    res.json({
      priorities: priorities.rows,
      trades: trades.rows,
      levels: levels.rows
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
  distributeProjectQuantityAcrossAssignments
});

// Legacy project/challenge/assignment endpoints are registered via src/modules/projects.

// Data portability endpoints (export/import) use stricter permissions.
app.get('/api/export', requirePermission(PERMISSIONS.EXPORT_RUN), async (req, res) => {
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

app.get('/api/export/config', requirePermission(PERMISSIONS.EXPORT_RUN), async (req, res) => {
  try {
    const [trades, levels] = await Promise.all([
      pool.query('SELECT id, name FROM trades ORDER BY name'),
      pool.query('SELECT id, name FROM levels ORDER BY name')
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
        name: item?.name
      };
    })
    .map((item) => ({ id: item.id, name: String(item.name || '').trim() }))
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

app.get('/api/configuration', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (_req, res) => {
  try {
    const [trades, levels] = await Promise.all([
      pool.query(
        `SELECT t.id, t.name, COUNT(p.id)::int AS usage_count
         FROM trades t
         LEFT JOIN people p ON p.trade_id = t.id
         GROUP BY t.id, t.name
         ORDER BY t.name`
      ),
      pool.query(
        `SELECT l.id, l.name, COUNT(p.id)::int AS usage_count
         FROM levels l
         LEFT JOIN people p ON p.level_id = l.id
         GROUP BY l.id, l.name
         ORDER BY l.name`
      )
    ]);

    return res.json({ trades: trades.rows, levels: levels.rows });
  } catch (error) {
    return handleDbError(res, error);
  }
});

async function applyConfigurationCatalog({ trades, levels }) {
  const nextTrades = normalizeConfigurationItems(trades, 'trades');
  const nextLevels = normalizeConfigurationItems(levels, 'levels');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const [existingTrades, existingLevels] = await Promise.all([
      client.query(
        `SELECT t.id, t.name, COUNT(p.id)::int AS usage_count
         FROM trades t
         LEFT JOIN people p ON p.trade_id = t.id
         GROUP BY t.id, t.name`
      ),
      client.query(
        `SELECT l.id, l.name, COUNT(p.id)::int AS usage_count
         FROM levels l
         LEFT JOIN people p ON p.level_id = l.id
         GROUP BY l.id, l.name`
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
      await client.query('UPDATE levels SET name = $1 WHERE id = $2', [item.name, item.id]);
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
    const newLevelNames = nextLevels.filter((item) => !item.id).map((item) => item.name);

    if (newTradeNames.length > 0) {
      await client.query(
        `INSERT INTO trades (name)
         SELECT value FROM UNNEST($1::text[]) AS value`,
        [newTradeNames]
      );
    }
    if (newLevelNames.length > 0) {
      await client.query(
        `INSERT INTO levels (name)
         SELECT value FROM UNNEST($1::text[]) AS value`,
        [newLevelNames]
      );
    }

    await client.query('COMMIT');
    return { trades: nextTrades.length, levels: nextLevels.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

app.put('/api/configuration', requirePermission(PERMISSIONS.ADMIN_ACCESS), async (req, res) => {
  try {
    await applyConfigurationCatalog({ trades: req.body?.trades, levels: req.body?.levels });
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

    if (!PROJECT_STATUS_VALUES.includes(String(row.status || '').toLowerCase())) {
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
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n') || raw.includes('\r')) {
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

  const rows = [headers.join(',')];

  function pushRow(entity, row) {
    const values = headers.map((header) => {
      if (header === 'entity') return entity;
      if (entity === 'people' && header === 'person_status') return row.status;
      return row[header];
    });
    rows.push(values.map(csvEscape).join(','));
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

    if (char === ',') {
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
  const rows = ['entity,id,name'];
  (payload.trades || []).forEach((row) => rows.push([csvEscape('trades'), csvEscape(row.id), csvEscape(row.name)].join(',')));
  (payload.levels || []).forEach((row) => rows.push([csvEscape('levels'), csvEscape(row.id), csvEscape(row.name)].join(',')));
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

app.post('/api/import/preview', requirePermission(PERMISSIONS.IMPORT_RUN), async (req, res) => {
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

app.post('/api/import/config/preview', requirePermission(PERMISSIONS.IMPORT_RUN), async (req, res) => {
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

app.post('/api/import/config', requirePermission(PERMISSIONS.IMPORT_RUN), async (req, res) => {
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

app.post('/api/import', requirePermission(PERMISSIONS.IMPORT_RUN), async (req, res) => {
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
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

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

app.get('/health/ready', async (_req, res) => {
  return sendReadiness(res);
});

// Backward compatibility alias: historical /health behavior maps to readiness checks.
app.get('/health', async (_req, res) => {
  return sendReadiness(res);
});

app.get('/metrics', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  return res.send(renderPrometheusMetrics());
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
  validateAuthRuntimeSafety();

  try {
    await ensureProjectStatusColumn();
    await ensurePeopleFlagsColumns();
    await ensurePeopleStatusColumn();
    await ensurePeopleWorkingHoursColumn();
    await ensurePriorityCatalog();
    await ensurePeopleCatalog();
    await cleanupAuditLogRetention();
  } catch (error) {
    console.warn('Catalog initialization skipped at startup.', error.message);
  }

  app.listen(port, () => {
    console.log(`Projectory app listening on port ${port}`);
  });
}

module.exports = {
  app,
  startServer,
  pool,
  getAuthMode,
  validateAuthRuntimeSafety,
  clearRequestRateLimitBuckets,
  clearAuthAttemptBuckets,
  clearMetrics
};
