const onboardingService = require('./service');

function registerOnboardingRoutes(app, deps) {
  const { pool, badRequest, handleDbError, requirePermission, PERMISSIONS } = deps;

  app.get('/api/onboarding/profiles', async (_req, res) => {
    try {
      const profiles = await onboardingService.getProfiles(pool);
      return res.json(profiles);
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.post('/api/onboarding/profiles', requirePermission(PERMISSIONS.PEOPLE_WRITE), async (req, res) => {
    try {
      const result = await onboardingService.createProfile(pool, req.body);
      if (result.error) return badRequest(res, result.error);
      return res.status(201).json(result.value);
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.put('/api/onboarding/profiles/:id', requirePermission(PERMISSIONS.PEOPLE_WRITE), async (req, res) => {
    try {
      const result = await onboardingService.updateProfile(pool, req.params.id, req.body);
      if (result.error) return badRequest(res, result.error);
      if (result.value.rowCount === 0) return res.status(404).json({ error: 'Onboarding profile not found.' });
      return res.json({ ok: true });
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.delete('/api/onboarding/profiles/:id', requirePermission(PERMISSIONS.PEOPLE_WRITE), async (req, res) => {
    try {
      const result = await onboardingService.removeProfile(pool, req.params.id);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Onboarding profile not found.' });
      return res.json({ ok: true });
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.put('/api/onboarding/profiles/:id/steps', requirePermission(PERMISSIONS.PEOPLE_WRITE), async (req, res) => {
    try {
      const result = await onboardingService.upsertStep(pool, req.params.id, req.body);
      if (result.error) return badRequest(res, result.error);
      return res.json(result.value);
    } catch (error) {
      return handleDbError(res, error);
    }
  });
}

module.exports = { registerOnboardingRoutes };
