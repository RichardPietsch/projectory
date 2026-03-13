function registerCoreMiddlewareStack({
  app,
  requestRateLimitMiddleware,
  appWideDoSRateLimitMiddleware,
  requestTimeoutMs,
  requestBodyLimit,
  createRequestLifecycleLogger,
  attachAuthContext,
  staticAssetsPath,
  adminAuditRouteRateLimitMiddleware
}) {
  app.use(requestRateLimitMiddleware);
  app.use(appWideDoSRateLimitMiddleware);

  app.use((req, res, next) => {
    req.setTimeout(requestTimeoutMs, () => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request timeout.' });
      }
    });
    next();
  });

  app.use(expressJsonCompat(requestBodyLimit));
  app.use(expressUrlEncodedCompat(requestBodyLimit));
  app.use(createRequestLifecycleLogger());
  app.use(attachAuthContext);
  app.use(staticAssetsPath);
  app.use('/api/admin/audit', adminAuditRouteRateLimitMiddleware);
}

function expressJsonCompat(limit) {
  const express = require('express');
  return express.json({ limit });
}

function expressUrlEncodedCompat(limit) {
  const express = require('express');
  return express.urlencoded({ extended: true, limit });
}

module.exports = {
  registerCoreMiddlewareStack
};
