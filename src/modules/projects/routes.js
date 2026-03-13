const projectsRepo = require('./repo');
const projectsService = require('./service');

function registerProjectsRoutes(app, deps) {
  const {
    pool,
    badRequest,
    handleDbError,
    requirePermission,
    PERMISSIONS,
    requireMonth,
    normalizeProjectStatus,
    isScopedTeammate,
    canAccessProjectById,
    getChallengeProjectId,
    getAssignmentProjectContext,
    getPersonProjectTotalQuantity,
    distributeProjectQuantityAcrossAssignments,
    projectsMutationRouteRateLimitMiddleware,
    assignmentsMutationRouteRateLimitMiddleware
  } = deps;

  app.get('/api/projects', requirePermission(PERMISSIONS.PROJECTS_READ), async (req, res) => {
    try {
      const snapshot = await projectsService.getProjectsSnapshot(pool);
      if (isScopedTeammate(req.auth)) {
        return res.json(projectsService.filterScopedSnapshot(snapshot, req.auth.scopedProjectIds));
      }

      return res.json(snapshot);
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.post('/api/projects', requirePermission(PERMISSIONS.PROJECTS_WRITE), projectsMutationRouteRateLimitMiddleware, async (req, res) => {
    if (isScopedTeammate(req.auth)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    try {
      const result = await projectsService.createProject(pool, req.body, { requireMonth, normalizeProjectStatus });
      if (result.error) return badRequest(res, result.error);
      return res.status(201).json(result.value);
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.put('/api/projects/:id', requirePermission(PERMISSIONS.PROJECTS_WRITE), projectsMutationRouteRateLimitMiddleware, async (req, res) => {
    if (isScopedTeammate(req.auth)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    try {
      const result = await projectsService.updateProject(pool, req.params.id, req.body, { requireMonth, normalizeProjectStatus });
      if (result.error) return badRequest(res, result.error);
      if (result.value.rowCount === 0) return res.status(404).json({ error: 'Project not found.' });
      return res.json({ ok: true });
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.delete('/api/projects/:id', requirePermission(PERMISSIONS.PROJECTS_WRITE), projectsMutationRouteRateLimitMiddleware, async (req, res) => {
    if (isScopedTeammate(req.auth)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    try {
      const result = await projectsRepo.deleteProject(pool, req.params.id);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Project not found.' });
      return res.json({ ok: true });
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.post('/api/projects/:projectId/challenges', requirePermission(PERMISSIONS.PROJECTS_WRITE), projectsMutationRouteRateLimitMiddleware, async (req, res) => {
    if (!canAccessProjectById(req.auth, req.params.projectId)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    try {
      const result = await projectsService.createChallenge(pool, { ...req.body, projectId: req.params.projectId });
      if (result.error) return badRequest(res, result.error);
      return res.status(201).json(result.value);
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.put('/api/challenges/:id', requirePermission(PERMISSIONS.PROJECTS_WRITE), projectsMutationRouteRateLimitMiddleware, async (req, res) => {
    try {
      const projectId = await getChallengeProjectId(req.params.id);
      if (projectId === null) return res.status(404).json({ error: 'Challenge not found.' });
      if (!canAccessProjectById(req.auth, projectId)) return res.status(403).json({ error: 'Forbidden.' });

      const result = await projectsService.updateChallenge(pool, req.params.id, req.body);
      if (result.error) return badRequest(res, result.error);
      if (result.value.rowCount === 0) return res.status(404).json({ error: 'Challenge not found.' });
      return res.json({ ok: true });
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.delete('/api/challenges/:id', requirePermission(PERMISSIONS.PROJECTS_WRITE), projectsMutationRouteRateLimitMiddleware, async (req, res) => {
    try {
      const projectId = await getChallengeProjectId(req.params.id);
      if (projectId === null) return res.status(404).json({ error: 'Challenge not found.' });
      if (!canAccessProjectById(req.auth, projectId)) return res.status(403).json({ error: 'Forbidden.' });

      const result = await projectsRepo.deleteChallenge(pool, req.params.id);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Challenge not found.' });
      return res.json({ ok: true });
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.post('/api/assignments', requirePermission(PERMISSIONS.ASSIGNMENTS_WRITE), assignmentsMutationRouteRateLimitMiddleware, async (req, res) => {
    if (!canAccessProjectById(req.auth, req.body?.projectId)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    try {
      const result = await projectsService.createAssignment(pool, req.body || {}, {
        getPersonProjectTotalQuantity,
        distributeProjectQuantityAcrossAssignments
      });
      if (result.error) return badRequest(res, result.error);
      if (result.value.deduplicated) return res.json({ id: result.value.id, deduplicated: true });
      return res.status(201).json({ id: result.value.id });
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.put('/api/assignments/:id', requirePermission(PERMISSIONS.ASSIGNMENTS_WRITE), assignmentsMutationRouteRateLimitMiddleware, async (req, res) => {
    try {
      const assignmentContext = await getAssignmentProjectContext(req.params.id);
      if (!assignmentContext) return res.status(404).json({ error: 'Assignment not found.' });
      if (!canAccessProjectById(req.auth, assignmentContext.projectId)) return res.status(403).json({ error: 'Forbidden.' });

      const result = await projectsService.updateAssignment(pool, req.params.id, req.body || {});
      if (result.error) return badRequest(res, result.error);
      if (result.value.rowCount === 0) return res.status(404).json({ error: 'Assignment not found.' });
      return res.json({ ok: true });
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.put('/api/projects/:projectId/people/:personId/quantity', requirePermission(PERMISSIONS.ASSIGNMENTS_WRITE), assignmentsMutationRouteRateLimitMiddleware, async (req, res) => {
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100) {
      return badRequest(res, 'quantity must be an integer between 0 and 100.');
    }

    if (!canAccessProjectById(req.auth, req.params.projectId)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    if (isScopedTeammate(req.auth) && Number(req.auth.personId) !== Number(req.params.personId)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    try {
      const result = await projectsService.updatePersonProjectQuantity(
        pool,
        req.params.projectId,
        req.params.personId,
        quantity,
        { distributeProjectQuantityAcrossAssignments }
      );
      if (result.error) return res.status(result.notFound ? 404 : 400).json({ error: result.error });

      return res.json({ ok: true, updated: result.value.updated, projectQuantity: result.value.projectQuantity });
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.delete('/api/assignments/:id', requirePermission(PERMISSIONS.ASSIGNMENTS_WRITE), assignmentsMutationRouteRateLimitMiddleware, async (req, res) => {
    try {
      const assignmentContext = await getAssignmentProjectContext(req.params.id);
      if (!assignmentContext) return res.status(404).json({ error: 'Assignment not found.' });
      if (!canAccessProjectById(req.auth, assignmentContext.projectId)) return res.status(403).json({ error: 'Forbidden.' });

      await projectsService.deleteAssignment(pool, req.params.id, {
        getPersonProjectTotalQuantity,
        distributeProjectQuantityAcrossAssignments
      });
      return res.json({ ok: true });
    } catch (error) {
      return handleDbError(res, error);
    }
  });
}

module.exports = { registerProjectsRoutes };
