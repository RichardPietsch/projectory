const AUTH_MODES = new Set(['session', 'hybrid', 'header']);
function normalizeEnv(value) {
  return String(value || '').trim().toLowerCase();
}

function isLocalDevRuntime() {
  return normalizeEnv(process.env.AUTH_LOCAL_DEV) === 'true';
}

function getAuthMode() {
  const mode = normalizeEnv(process.env.AUTH_MODE || 'session');
  return AUTH_MODES.has(mode) ? mode : 'session';
}

function isHeaderSimulationEnabled() {
  return isLocalDevRuntime() && normalizeEnv(process.env.AUTH_ALLOW_HEADER_SIMULATION) === 'true';
}

function validateAuthRuntimeSafety() {
  const authMode = getAuthMode();
  const localDev = isLocalDevRuntime();
  const headerSimulationEnabled = normalizeEnv(process.env.AUTH_ALLOW_HEADER_SIMULATION) === 'true';

  if (!localDev && authMode !== 'session') {
    throw new Error(`Unsafe auth configuration: AUTH_MODE=${authMode}. Non-local environments require AUTH_MODE=session.`);
  }

  if (!localDev && headerSimulationEnabled) {
    throw new Error('Unsafe auth configuration: AUTH_ALLOW_HEADER_SIMULATION=true is only allowed for local development.');
  }
}

module.exports = {
  getAuthMode,
  isLocalDevRuntime,
  isHeaderSimulationEnabled,
  validateAuthRuntimeSafety
};
