async function listPeople(pool) {
  return pool.query(
    `SELECT p.id, p.first_name, p.last_name,
            t.id AS trade_id, t.name AS trade_name,
            l.id AS level_id, l.name AS level_name,
            COALESCE(COUNT(a.id), 0) AS assignment_count,
            COALESCE(SUM(a.quantity), 0) AS assignment_quantity_total,
            COALESCE(p.is_hidden, FALSE) AS is_hidden,
            COALESCE(p.is_leaver, FALSE) AS is_leaver,
            p.status,
            p.working_hours
     FROM people p
     JOIN trades t ON p.trade_id = t.id
     JOIN levels l ON p.level_id = l.id
     LEFT JOIN assignments a ON a.person_id = p.id
     GROUP BY p.id, t.id, l.id
     ORDER BY p.last_name, p.first_name`
  );
}


async function listPeopleByProjectIds(pool, projectIds) {
  return pool.query(
    `SELECT p.id, p.first_name, p.last_name,
            t.id AS trade_id, t.name AS trade_name,
            l.id AS level_id, l.name AS level_name,
            COALESCE(COUNT(a.id), 0) AS assignment_count,
            COALESCE(SUM(a.quantity), 0) AS assignment_quantity_total,
            COALESCE(p.is_hidden, FALSE) AS is_hidden,
            COALESCE(p.is_leaver, FALSE) AS is_leaver,
            p.status,
            p.working_hours
     FROM people p
     JOIN trades t ON p.trade_id = t.id
     JOIN levels l ON p.level_id = l.id
     LEFT JOIN assignments a ON a.person_id = p.id AND a.project_id = ANY($1::int[])
     WHERE EXISTS (
       SELECT 1
       FROM assignments scoped
       WHERE scoped.person_id = p.id
         AND scoped.project_id = ANY($1::int[])
     )
     GROUP BY p.id, t.id, l.id
     ORDER BY p.last_name, p.first_name`,
    [projectIds]
  );
}

async function createPerson(pool, person) {
  return pool.query(
    `INSERT INTO people (first_name, last_name, trade_id, level_id, is_hidden, is_leaver, status, working_hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      person.firstName,
      person.lastName,
      person.tradeId,
      person.levelId,
      person.isHidden,
      person.isLeaver,
      person.status,
      person.workingHours
    ]
  );
}

async function updatePerson(pool, id, person) {
  return pool.query(
    `UPDATE people
     SET first_name = $1, last_name = $2, trade_id = $3, level_id = $4, is_hidden = $5, is_leaver = $6, status = COALESCE($7, status), working_hours = $8
     WHERE id = $9`,
    [
      person.firstName,
      person.lastName,
      person.tradeId,
      person.levelId,
      person.isHidden,
      person.isLeaver,
      person.status,
      person.workingHours,
      id
    ]
  );
}

async function deletePerson(pool, id) {
  return pool.query('DELETE FROM people WHERE id = $1', [id]);
}

module.exports = {
  listPeople,
  listPeopleByProjectIds,
  createPerson,
  updatePerson,
  deletePerson
};
