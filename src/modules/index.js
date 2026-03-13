const { registerPeopleRoutes } = require('./people/routes');
const { registerClientsRoutes } = require('./clients/routes');
const { registerOnboardingRoutes } = require('./onboarding/routes');
const { registerProjectsRoutes } = require('./projects/routes');

// Central place to wire domain modules into the Express app.
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
    requireMonth: deps.requireMonth,
    requirePermission: deps.requirePermission,
    PERMISSIONS: deps.PERMISSIONS
  });

  registerOnboardingRoutes(app, {
    pool: deps.pool,
    badRequest: deps.badRequest,
    handleDbError: deps.handleDbError,
    requirePermission: deps.requirePermission,
    PERMISSIONS: deps.PERMISSIONS
  });
  registerProjectsRoutes(app, {
    pool: deps.pool,
    badRequest: deps.badRequest,
    handleDbError: deps.handleDbError,
    requireMonth: deps.requireMonth,
    normalizeProjectStatus: deps.normalizeProjectStatus,
    requirePermission: deps.requirePermission,
    PERMISSIONS: deps.PERMISSIONS,
    isScopedTeammate: deps.isScopedTeammate,
    canAccessProjectById: deps.canAccessProjectById,
    getChallengeProjectId: deps.getChallengeProjectId,
    getAssignmentProjectContext: deps.getAssignmentProjectContext,
    getPersonProjectTotalQuantity: deps.getPersonProjectTotalQuantity,
    distributeProjectQuantityAcrossAssignments: deps.distributeProjectQuantityAcrossAssignments,
    projectsMutationRouteRateLimitMiddleware: deps.projectsMutationRouteRateLimitMiddleware,
    assignmentsMutationRouteRateLimitMiddleware: deps.assignmentsMutationRouteRateLimitMiddleware
  });
}


module.exports = {
  registerModuleRoutes
};
