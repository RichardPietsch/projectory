async function listClients(pool) {
  return pool.query(
    `SELECT c.id, c.name, c.location, c.since_month,
            p.id AS priority_id, p.name AS priority_name, p.color_hex AS priority_color_hex, p.sort_order AS priority_sort_order,
            COALESCE(COUNT(pr.id), 0) AS project_count
     FROM clients c
     JOIN priorities p ON c.priority_id = p.id
     LEFT JOIN projects pr ON pr.client_id = c.id
     GROUP BY c.id, p.id
     ORDER BY c.name`
  );
}

async function createClient(pool, client) {
  return pool.query(
    `INSERT INTO clients (name, location, since_month, priority_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [client.name, client.location, client.sinceMonth, client.priorityId]
  );
}

async function updateClient(pool, id, client) {
  return pool.query(
    `UPDATE clients
     SET name = $1, location = $2, since_month = $3, priority_id = $4
     WHERE id = $5`,
    [client.name, client.location, client.sinceMonth, client.priorityId, id]
  );
}

async function deleteClient(pool, id) {
  return pool.query('DELETE FROM clients WHERE id = $1', [id]);
}

module.exports = {
  listClients,
  createClient,
  updateClient,
  deleteClient
};
