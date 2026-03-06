(function onboardingTourModule(globalScope) {
  const PEOPLE_OVERVIEW_STEP_ID = 'people-overview';

  function normalizeRole(roleName) {
    return String(roleName || '').trim().toLowerCase() || 'viewer';
  }

  function roleCanSeePeopleOverview(roleName) {
    return ['admin', 'planner', 'viewer'].includes(normalizeRole(roleName));
  }

  function filterOnboardingStepsByRole(steps, roleName) {
    const canSeePeopleOverview = roleCanSeePeopleOverview(roleName);
    if (canSeePeopleOverview) return steps;

    return (steps || []).filter((step) => String(step?.id || '') !== PEOPLE_OVERVIEW_STEP_ID);
  }

  function clampOnboardingStepIndex(stepIndex, totalSteps) {
    const safeTotal = Math.max(0, Number(totalSteps) || 0);
    if (safeTotal <= 1) return 0;
    const parsed = Number(stepIndex);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(safeTotal - 1, Math.floor(parsed)));
  }

  function getOnboardingStepUiState(stepIndex, totalSteps) {
    const safeTotal = Math.max(1, Number(totalSteps) || 1);
    const safeIndex = clampOnboardingStepIndex(stepIndex, safeTotal);
    const isLastStep = safeIndex === safeTotal - 1;

    return {
      index: safeIndex,
      current: safeIndex + 1,
      total: safeTotal,
      isFirstStep: safeIndex === 0,
      isLastStep,
      nextAction: isLastStep ? 'finish' : 'next'
    };
  }

  const api = {
    PEOPLE_OVERVIEW_STEP_ID,
    normalizeRole,
    roleCanSeePeopleOverview,
    filterOnboardingStepsByRole,
    clampOnboardingStepIndex,
    getOnboardingStepUiState
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.ProjectoryOnboardingTour = api;
}(typeof window !== 'undefined' ? window : globalThis));
