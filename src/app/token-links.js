function resolveAppBaseUrl(env = process.env) {
  return String(env.APP_BASE_URL || 'http://localhost:3000/').trim().replace(/\/$/, '');
}

function buildInviteLink(token, env = process.env) {
  return `${resolveAppBaseUrl(env)}/invite?token=${encodeURIComponent(token)}`;
}

function buildPasswordResetLink(token, env = process.env) {
  return `${resolveAppBaseUrl(env)}/reset-password?token=${encodeURIComponent(token)}`;
}

module.exports = {
  resolveAppBaseUrl,
  buildInviteLink,
  buildPasswordResetLink
};
