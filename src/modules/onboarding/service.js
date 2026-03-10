const onboardingRepo = require('./repo');
const { validateOnboardingProfilePayload, validateOnboardingStepPayload } = require('./schema');

async function getProfiles(pool) {
  const result = await onboardingRepo.listProfiles(pool);
  return result.rows;
}

async function createProfile(pool, body) {
  const parsed = validateOnboardingProfilePayload(body);
  if (parsed.error) return { error: parsed.error };

  const result = await onboardingRepo.createProfile(pool, parsed.value);
  return { value: { id: result.rows[0].id } };
}

async function updateProfile(pool, id, body) {
  const parsed = validateOnboardingProfilePayload(body);
  if (parsed.error) return { error: parsed.error };

  const result = await onboardingRepo.updateProfile(pool, id, parsed.value);
  return { value: { rowCount: result.rowCount } };
}

async function removeProfile(pool, id) {
  const result = await onboardingRepo.deleteProfile(pool, id);
  return { rowCount: result.rowCount };
}

async function upsertStep(pool, profileId, body) {
  const parsed = validateOnboardingStepPayload(body);
  if (parsed.error) return { error: parsed.error };

  const result = await onboardingRepo.upsertStep(pool, profileId, parsed.value);
  return { value: { id: result.rows[0].id } };
}

module.exports = {
  getProfiles,
  createProfile,
  updateProfile,
  removeProfile,
  upsertStep
};
