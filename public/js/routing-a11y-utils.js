(function registerProjectoryRoutingA11yUtils(globalScope) {
  function resolveTabNavigationIndex(currentIndex, key, total) {
    const count = Math.max(0, Number(total) || 0);
    if (count <= 0) return -1;

    const index = Math.min(Math.max(Number(currentIndex) || 0, 0), count - 1);
    if (key === 'ArrowRight') return (index + 1) % count;
    if (key === 'ArrowLeft') return (index - 1 + count) % count;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return -1;
  }

  function modalCloseRequestedByKeyboard(event) {
    return Boolean(event && event.key === 'Escape');
  }

  globalScope.ProjectoryRoutingA11yUtils = {
    resolveTabNavigationIndex,
    modalCloseRequestedByKeyboard
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      resolveTabNavigationIndex,
      modalCloseRequestedByKeyboard
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
