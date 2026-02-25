const clientsRepo = require('./repo');
const { validateClientPayload } = require('./schema');

function buildClientInput(body, requireMonth) {
  const validation = validateClientPayload(body, requireMonth);
  if (validation.error) {
    return { error: validation.error };
  }

  return { value: validation.value };
}

async function getClients(pool) {
  const result = await clientsRepo.listClients(pool);
  return result.rows;
}

async function createClient(pool, body, requireMonth) {
  const parsed = buildClientInput(body, requireMonth);
  if (parsed.error) {
    return { error: parsed.error };
  }

  const result = await clientsRepo.createClient(pool, parsed.value);
  return { value: { id: result.rows[0].id } };
}

async function updateClient(pool, id, body, requireMonth) {
  const parsed = buildClientInput(body, requireMonth);
  if (parsed.error) {
    return { error: parsed.error };
  }

  const result = await clientsRepo.updateClient(pool, id, parsed.value);
  return { value: { rowCount: result.rowCount } };
}

async function removeClient(pool, id) {
  const result = await clientsRepo.deleteClient(pool, id);
  return { rowCount: result.rowCount };
}

module.exports = {
  getClients,
  createClient,
  updateClient,
  removeClient
};
