const clientsService = require('./service');

function registerClientsRoutes(app, deps) {
  const { pool, badRequest, handleDbError, requireMonth } = deps;

  app.get('/api/clients', async (_req, res) => {
    try {
      const clients = await clientsService.getClients(pool);
      return res.json(clients);
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.post('/api/clients', async (req, res) => {
    try {
      const result = await clientsService.createClient(pool, req.body, requireMonth);
      if (result.error) {
        return badRequest(res, result.error);
      }

      return res.status(201).json(result.value);
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.put('/api/clients/:id', async (req, res) => {
    try {
      const result = await clientsService.updateClient(pool, req.params.id, req.body, requireMonth);
      if (result.error) {
        return badRequest(res, result.error);
      }

      if (result.value.rowCount === 0) {
        return res.status(404).json({ error: 'Client not found.' });
      }

      return res.json({ ok: true });
    } catch (error) {
      return handleDbError(res, error);
    }
  });

  app.delete('/api/clients/:id', async (req, res) => {
    try {
      const result = await clientsService.removeClient(pool, req.params.id);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Client not found.' });
      }
      return res.json({ ok: true });
    } catch (error) {
      return handleDbError(res, error);
    }
  });
}

module.exports = { registerClientsRoutes };
