const peopleService = require('./service');

function registerPeopleRoutes(app, deps) {
  const { pool, badRequest, handleDbError, parseOptionalBoolean, parseWorkingHours, requirePermission, PERMISSIONS } = deps;

  app.get('/api/people', async (req, res) => {
    try {
      if (req.auth?.isScopedTeammate) {
        // Teammates only see people from projects within their assigned scope.
        const scopedIds = Array.isArray(req.auth.scopedProjectIds) ? req.auth.scopedProjectIds : [];
        if (scopedIds.length === 0) {
          return res.json([]);
        }
        const people = await peopleService.getPeopleByProjectIds(pool, scopedIds);
        return res.json(people);
      }

      const people = await peopleService.getPeople(pool);
      return res.json(people);
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.post('/api/people', requirePermission(PERMISSIONS.PEOPLE_WRITE), async (req, res) => {
    try {
      const result = await peopleService.createPerson(pool, req.body, parseOptionalBoolean, parseWorkingHours);
      if (result.error) {
        return badRequest(res, result.error);
      }

      return res.status(201).json(result.value);
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.put('/api/people/:id', requirePermission(PERMISSIONS.PEOPLE_WRITE), async (req, res) => {
    try {
      const result = await peopleService.updatePerson(
        pool,
        req.params.id,
        req.body,
        parseOptionalBoolean,
        parseWorkingHours
      );
      if (result.error) {
        return badRequest(res, result.error);
      }

      if (result.value.rowCount === 0) {
        return res.status(404).json({ error: 'Person not found.' });
      }

      return res.json({ ok: true });
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.delete('/api/people/:id', requirePermission(PERMISSIONS.PEOPLE_WRITE), async (req, res) => {
    try {
      const result = await peopleService.removePerson(pool, req.params.id);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Person not found.' });
      }
      return res.json({ ok: true });
    } catch (error) {
      return handleDbError(res, error);
    }
  });
}

module.exports = { registerPeopleRoutes };
