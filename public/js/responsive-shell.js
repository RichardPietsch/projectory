(function registerProjectoryResponsiveShell(globalScope) {
  function getShellState() {
    const appState = globalScope.ProjectoryAppState || globalScope.ProjectoryState?.createInitialState?.();
    if (!appState.shell) appState.shell = { mobileMenuOpen: false };
    return appState.shell;
  }

  function syncHeaderControls() {
    const shell = getShellState();
    const desktopSelect = document.getElementById('locale-select');
    const mobileSelect = document.getElementById('locale-select-mobile');
    const menuToggle = document.getElementById('header-menu-toggle');
    const mobileControls = document.getElementById('header-mobile-controls');

    if (desktopSelect && mobileSelect && mobileSelect.value !== desktopSelect.value) {
      mobileSelect.value = desktopSelect.value;
    }

    if (menuToggle) {
      menuToggle.setAttribute('aria-expanded', shell.mobileMenuOpen ? 'true' : 'false');
    }

    if (mobileControls) {
      mobileControls.classList.toggle('hidden', !shell.mobileMenuOpen);
    }

    return shell.mobileMenuOpen;
  }

  function closeMobileMenu() {
    const shell = getShellState();
    if (!shell.mobileMenuOpen) return false;
    shell.mobileMenuOpen = false;
    syncHeaderControls();
    return true;
  }

  function openMobileMenu() {
    const shell = getShellState();
    if (shell.mobileMenuOpen) return true;
    shell.mobileMenuOpen = true;
    syncHeaderControls();
    return true;
  }

  function toggleMobileMenu() {
    const shell = getShellState();
    shell.mobileMenuOpen = !shell.mobileMenuOpen;
    syncHeaderControls();
    return shell.mobileMenuOpen;
  }

  function closeMobileMenuOnDesktop() {
    if (globalScope.matchMedia && globalScope.matchMedia('(min-width: 768px)').matches) {
      closeMobileMenu();
    }
  }

  globalScope.ProjectoryResponsiveShell = {
    syncHeaderControls,
    closeMobileMenu,
    openMobileMenu,
    toggleMobileMenu,
    closeMobileMenuOnDesktop
  };
})(window);
