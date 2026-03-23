async function listProfiles(pool) {
  return pool.query(
    `SELECT p.id, p.person_id, p.first_name, p.last_name, p.email, p.start_date, p.status, p.notes,
            p.created_at, p.updated_at,
            COALESCE(COUNT(s.id), 0) AS step_count,
            COALESCE(SUM(CASE WHEN s.is_done THEN 1 ELSE 0 END), 0) AS step_done_count
     FROM onboarding_profiles p
     LEFT JOIN onboarding_steps s ON s.profile_id = p.id
     GROUP BY p.id
     ORDER BY p.created_at DESC`
  );
}

async function createProfile(pool, profile) {
  return pool.query(
    `INSERT INTO onboarding_profiles (person_id, first_name, last_name, email, start_date, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [profile.personId, profile.firstName, profile.lastName, profile.email, profile.startDate, profile.status, profile.notes]
  );
}

async function updateProfile(pool, id, profile) {
  return pool.query(
    `UPDATE onboarding_profiles
     SET person_id = $1,
         first_name = $2,
         last_name = $3,
         email = $4,
         start_date = $5,
         status = $6,
         notes = $7,
         updated_at = NOW()
     WHERE id = $8`,
    [profile.personId, profile.firstName, profile.lastName, profile.email, profile.startDate, profile.status, profile.notes, id]
  );
}

async function deleteProfile(pool, id) {
  return pool.query('DELETE FROM onboarding_profiles WHERE id = $1', [id]);
}

async function upsertStep(pool, profileId, step) {
  return pool.query(
    `INSERT INTO onboarding_steps (profile_id, step_key, label, is_done, completed_at, sort_order)
     VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END, $5)
     ON CONFLICT (profile_id, step_key) DO UPDATE
     SET label = EXCLUDED.label,
         is_done = EXCLUDED.is_done,
         completed_at = CASE WHEN EXCLUDED.is_done THEN NOW() ELSE NULL END,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()
     RETURNING id`,
    [profileId, step.stepKey, step.label, step.isDone, step.sortOrder]
  );
}

module.exports = {
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  upsertStep
};
