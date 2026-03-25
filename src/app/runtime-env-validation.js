function validateRuntimeEnvironment({
  isLocalDevRuntime,
  resolveTrustProxySetting,
  env = process.env
}) {
  if (isLocalDevRuntime()) {
    return;
  }

  const requiredNames = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'SMTP_PASSWORD_ENCRYPTION_KEY', 'AUTH_CSRF_SECRET'];
  const missing = requiredNames.filter((name) => !String(env[name] || '').trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables for non-local runtime: ${missing.join(', ')}.`);
  }

  if (String(env.DB_USER).trim() === 'projectory_local_user' || String(env.DB_PASSWORD).trim() === 'projectory_local_password') {
    throw new Error('Unsafe database credentials detected for non-local runtime. Replace DB_USER/DB_PASSWORD defaults.');
  }

  if (String(env.SMTP_PASSWORD_ENCRYPTION_KEY || '').trim().length < 32) {
    throw new Error('SMTP_PASSWORD_ENCRYPTION_KEY must be set to a strong secret (minimum 32 characters) in non-local runtime.');
  }

  if (resolveTrustProxySetting() === false) {
    throw new Error('TRUST_PROXY must be configured for non-local runtime to ensure secure proxy-aware session handling.');
  }

  if (String(env.AUTH_COOKIE_SECURE || '').trim().toLowerCase() === 'false') {
    throw new Error('AUTH_COOKIE_SECURE=false is not allowed in non-local runtime.');
  }
}

module.exports = {
  validateRuntimeEnvironment
};
