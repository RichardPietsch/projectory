const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
}

module.exports = {
  CONTENT_SECURITY_POLICY,
  applySecurityHeaders
};
