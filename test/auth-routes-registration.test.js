const test = require('node:test');
const assert = require('node:assert/strict');

const { registerAuthRoutes } = require('../src/app/auth-routes');

test('registerAuthRoutes wires auth endpoints with expected middleware placement', () => {
  const calls = [];
  const app = {
    get(path, ...handlers) { calls.push({ method: 'get', path, handlers: handlers.length }); },
    post(path, ...handlers) { calls.push({ method: 'post', path, handlers: handlers.length }); }
  };

  const noop = () => {};
  registerAuthRoutes({
    app,
    loginRouteRateLimitMiddleware: noop,
    registerInitialAdminRouteRateLimitMiddleware: noop,
    forgotPasswordRouteRateLimitMiddleware: noop,
    handlers: {
      me: noop,
      bootstrapStatus: noop,
      registerInitialAdmin: noop,
      login: noop,
      logout: noop,
      forgotPassword: noop,
      resetPassword: noop,
      invitePreview: noop,
      acceptInvite: noop
    }
  });

  assert.deepEqual(calls.map((c) => `${c.method}:${c.path}:${c.handlers}`), [
    'get:/api/auth/me:1',
    'get:/api/auth/bootstrap-status:1',
    'post:/api/auth/register-initial-admin:2',
    'post:/api/auth/login:2',
    'post:/api/auth/logout:1',
    'post:/api/auth/forgot-password:2',
    'post:/api/auth/reset-password:1',
    'post:/api/auth/invite-preview:1',
    'post:/api/auth/accept-invite:1'
  ]);
});
