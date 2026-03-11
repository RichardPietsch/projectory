function registerAuthRoutes({ app, forgotPasswordRouteRateLimitMiddleware, handlers }) {
  app.get('/api/auth/me', handlers.me);
  app.get('/api/auth/bootstrap-status', handlers.bootstrapStatus);
  app.post('/api/auth/register-initial-admin', handlers.registerInitialAdmin);
  app.post('/api/auth/login', handlers.login);
  app.post('/api/auth/logout', handlers.logout);
  app.post('/api/auth/forgot-password', forgotPasswordRouteRateLimitMiddleware, handlers.forgotPassword);
  app.post('/api/auth/reset-password', handlers.resetPassword);
  app.post('/api/auth/invite-preview', handlers.invitePreview);
  app.post('/api/auth/accept-invite', handlers.acceptInvite);
}

module.exports = {
  registerAuthRoutes
};
