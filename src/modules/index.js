const { registerPeopleRoutes } = require('./people/routes');
const { registerClientsRoutes } = require('./clients/routes');
const { registerOnboardingRoutes } = require('./onboarding/routes');

function registerModuleRoutes(app, deps) {
  registerPeopleRoutes(app, {
    pool: deps.pool,
    badRequest: deps.badRequest,
    handleDbError: deps.handleDbError,
    parseOptionalBoolean: deps.parseOptionalBoolean,
    parseWorkingHours: deps.parseWorkingHours,
    requirePermission: deps.requirePermission,
    PERMISSIONS: deps.PERMISSIONS
  });

  registerClientsRoutes(app, {
    pool: deps.pool,
    badRequest: deps.badRequest,
    handleDbError: deps.handleDbError,
    requireMonth: deps.requireMonth
  });

  registerOnboardingRoutes(app, {
    pool: deps.pool,
    badRequest: deps.badRequest,
    handleDbError: deps.handleDbError,
    requirePermission: deps.requirePermission,
    PERMISSIONS: deps.PERMISSIONS
  });
}

module.exports = {
  registerModuleRoutes
};
