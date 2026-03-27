const test = require('node:test');
const assert = require('node:assert/strict');

const { registerCoreMiddlewareStack } = require('../src/app/middleware-stack');

test('registerCoreMiddlewareStack composes middleware in stable order', () => {
  const calls = [];
  const app = {
    use(...args) {
      calls.push(args.length === 1 ? 'use:global' : `use:${args[0]}`);
    }
  };

  registerCoreMiddlewareStack({
    app,
    requestRateLimitMiddleware: () => {},
    appWideDoSRateLimitMiddleware: () => {},
    requestTimeoutMs: 15000,
    requestBodyLimit: '100kb',
    createRequestLifecycleLogger: () => () => {},
    attachAuthContext: () => {},
    staticAssetsPath: () => {},
    adminAuditRouteRateLimitMiddleware: () => {}
  });

  assert.deepEqual(calls, [
    'use:global',
    'use:global',
    'use:global',
    'use:global',
    'use:global',
    'use:global',
    'use:global',
    'use:global',
    'use:/api/admin/audit'
  ]);
});
