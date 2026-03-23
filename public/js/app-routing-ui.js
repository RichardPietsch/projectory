      function trimSlashes(value) {
        let normalized = String(value || '/');
        while (normalized.startsWith('/')) normalized = normalized.slice(1);
        while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
        return normalized;
      }

      const projectoryRoutingUiA11yUtils = window.ProjectoryRoutingA11yUtils || {};
      const resolveTabNavigationIndex = projectoryRoutingUiA11yUtils.resolveTabNavigationIndex || (() => -1);
      let lastRenderedViewKind = null;

      function getViewKind() {
        if (state.inviteFlow?.active) return 'invite';
        if (state.resetPasswordFlow?.active) return 'reset-password';
        if (needsLoginScreen()) return 'login';
        if (state.showAdmin) return 'admin';
        return 'home';
      }

      function focusViewHeading(viewKind) {
        const selectorByKind = {
          invite: '#invite-activate-form input, #invite-activate-form button',
          'reset-password': '#reset-password-form input, #reset-password-form button',
          login: '#login-email, #login-form button',
          admin: '#admin-standalone-title, #admin-toggle',
          home: '#onboarding-tab-client-teams, #app-logo-button'
        };
        const selector = selectorByKind[viewKind];
        if (!selector) return;
        const target = document.querySelector(selector);
        if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
      }

      function renderHomeShell(viewRoot, homeContent) {
        if (viewRoot.dataset.viewKind !== 'home') {
          // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          viewRoot.innerHTML = '<div id="home-tabs-region"></div><div id="home-content-region"></div>';
          viewRoot.dataset.viewKind = 'home';
        }

        const tabsRegion = document.getElementById('home-tabs-region');
        if (tabsRegion) {
          tabsRegion.innerHTML = '';
          renderHomeTabs(tabsRegion);
        }

        const contentRegion = document.getElementById('home-content-region');
        if (contentRegion) {
          // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          contentRegion.innerHTML = homeContent;
        }
      }

      function parseAppRoute(pathname) {
        const normalized = trimSlashes(pathname);
        const parts = normalized ? normalized.split('/') : [];

        if (parts.length === 0 || (parts.length === 1 && parts[0] === 'teams')) {
          return { mode: 'app', homeTab: 'client-teams', projectId: '', personId: '' };
        }

        if (parts[0] === 'teams' && parts.length === 2) {
          return { mode: 'app', homeTab: 'client-teams', projectId: parts[1], personId: '' };
        }

        if (parts.length === 1 && parts[0] === 'people') {
          return { mode: 'app', homeTab: 'people-overview', projectId: '', personId: '' };
        }

        if (parts[0] === 'people' && parts.length === 2) {
          return { mode: 'app', homeTab: 'people-overview', projectId: '', personId: parts[1] };
        }

        if (parts.length === 1 && parts[0] === 'invite') {
          return { mode: 'invite' };
        }

        if (parts.length === 1 && parts[0] === 'reset-password') {
          return { mode: 'reset-password' };
        }

        if (parts.length === 1 && parts[0] === 'admin') {
          return { mode: 'admin', adminTab: state.adminTab || 'people' };
        }

        if (parts[0] === 'admin' && parts.length === 2 && adminTabs.some((tab) => tab.id === parts[1])) {
          return { mode: 'admin', adminTab: parts[1] };
        }

        return null;
      }

      function applyAppRoute(pathname) {
        const route = parseAppRoute(pathname);
        if (!route) return false;

        if (route.mode === 'invite') {
          state.showAdmin = false;
          return true;
        }

        if (route.mode === 'reset-password') {
          state.showAdmin = false;
          return true;
        }

        if (route.mode === 'admin') {
          if (!canAccessAdmin()) {
            state.showAdmin = false;
            state.homeTab = 'client-teams';
            state.selectedProjectId = '';
            return true;
          }
          state.showAdmin = true;
          state.adminTab = route.adminTab || 'people';
          state.peopleOverviewModal.open = false;
          state.peopleOverviewModal.personId = null;
          return true;
        }

        state.showAdmin = false;
        state.homeTab = route.homeTab;

        if (!canViewPeopleOverview() && state.homeTab === 'people-overview') {
          state.homeTab = 'client-teams';
        }

        if (route.homeTab === 'client-teams' || state.homeTab === 'client-teams') {
          const hasProject = route.projectId && state.projectsPayload.projects.some((project) => String(project.id) === String(route.projectId));
          state.selectedProjectId = hasProject ? String(route.projectId) : '';
          state.peopleOverviewModal.open = false;
          state.peopleOverviewModal.personId = null;
          return true;
        }

        state.selectedProjectId = '';
        if (route.personId && state.people.some((person) => String(person.id) === String(route.personId) && personIsVisibleInNonAdmin(person))) {
          state.peopleOverviewModal.open = true;
          state.peopleOverviewModal.personId = String(route.personId);
        } else {
          state.peopleOverviewModal.open = false;
          state.peopleOverviewModal.personId = null;
        }

        return true;
      }

      function pathFromState() {
        if (state.inviteFlow?.active) {
          return `/invite?token=${encodeURIComponent(state.inviteFlow.token || '')}`;
        }

        if (state.resetPasswordFlow?.active) {
          return `/reset-password?token=${encodeURIComponent(state.resetPasswordFlow.token || '')}`;
        }

        if (state.showAdmin) {
          return state.adminTab === 'people' ? '/admin' : `/admin/${state.adminTab}`;
        }

        if (state.homeTab === 'people-overview' && canViewPeopleOverview()) {
          if (state.peopleOverviewModal.open && state.peopleOverviewModal.personId) {
            return `/people/${state.peopleOverviewModal.personId}`;
          }
          return '/people';
        }

        if (state.selectedProjectId) {
          return `/teams/${state.selectedProjectId}`;
        }

        return '/teams';
      }

      function navigateFromState(push = true) {
        const targetPath = pathFromState();
        if (window.location.pathname === targetPath) return;
        const method = push ? 'pushState' : 'replaceState';
        window.history[method]({}, '', targetPath);
      }

      window.setHomeTab = function setHomeTab(tabId) {
        if (tabId === 'people-overview' && !canViewPeopleOverview()) {
          state.homeTab = 'client-teams';
          navigateFromState();
          render();
          return;
        }
        state.homeTab = tabId;
        if (tabId === 'client-teams') {
          state.peopleOverviewModal.open = false;
          state.peopleOverviewModal.personId = null;
        }
        navigateFromState();
        render();
      };

      function adminStandaloneView() {
        const tabs = adminTabs.map((tab) => `<button class="rounded-lg border px-4 py-2 text-sm font-semibold ${state.adminTab === tab.id ? 'border-[#00d8ff] bg-[#00d8ff]/15 text-[#7cecff]' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}" onclick="setAdminTab('${tab.id}')">${i18n.t(tab.labelKey)}</button>`).join('');
        const body = state.adminTab === 'people' ? peopleView() : state.adminTab === 'clients' ? clientsView() : state.adminTab === 'projects' ? administrationProjectsView() : state.adminTab === 'access' ? accessManagementView() : configurationView();
        return `<div class="space-y-4"><div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 id="admin-standalone-title" tabindex="-1" class="text-2xl font-bold">${i18n.t('admin.title')}</h2><button class="rounded border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800 sm:self-auto" onclick="closeAdminStandalone()">${i18n.t('common.backToApp')}</button></div><div class="overflow-x-auto"><div class="flex min-w-max gap-2">${tabs}</div></div>${body}<footer class="mt-6 border-t border-zinc-800 pt-4 text-sm text-zinc-300"><div class="flex flex-wrap items-center gap-3"><button id="export-btn" class="rounded border border-zinc-600 px-3 py-2 hover:bg-zinc-800">${i18n.t('common.export')}</button><button id="import-btn" class="rounded border border-zinc-600 px-3 py-2 hover:bg-zinc-800">${i18n.t('common.import')}</button></div></footer></div>`;
      }

      window.setAdminTab = function setAdminTab(tabId) { if (!canAccessAdmin()) return; state.adminTab = tabId; state.showAdmin = true; navigateFromState(); render(); };
      window.closeAdminStandalone = function closeAdminStandalone() { state.showAdmin = false; navigateFromState(); render(); };

      function createHomeTabButton({ id, label, count, active, onClick }) {
        const safeDom = window.ProjectorySafeDom || {};
        const button = document.createElement('button');
        button.className = `inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold ${active ? 'border-[#00d8ff] text-[#00d8ff]' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`;
        button.id = id;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.setAttribute('tabindex', active ? '0' : '-1');
        button.addEventListener('click', onClick);

        const labelSpan = document.createElement('span');
        if (typeof safeDom.setText === 'function') {
          safeDom.setText(labelSpan, label);
        } else {
          labelSpan.textContent = label;
        }

        const countSpan = document.createElement('span');
        countSpan.className = 'rounded-full bg-current/15 px-2 py-0.5 text-xs';
        if (typeof safeDom.setText === 'function') {
          safeDom.setText(countSpan, String(count));
        } else {
          countSpan.textContent = String(count);
        }

        button.appendChild(labelSpan);
        button.appendChild(countSpan);
        return button;
      }

      function renderHomeTabs(container) {
        const tabsWrap = document.createElement('div');
        tabsWrap.className = 'mb-4 overflow-x-auto border-b border-zinc-800';

        const nav = document.createElement('nav');
        nav.className = '-mb-px flex min-w-max gap-4 sm:gap-6';
        nav.setAttribute('aria-label', 'Homepage tabs');
        nav.setAttribute('role', 'tablist');

        nav.appendChild(
          createHomeTabButton({
            id: 'onboarding-tab-client-teams',
            label: i18n.t('home.clientTeams'),
            count: state.projectsPayload.projects.length,
            active: state.homeTab === 'client-teams',
            onClick: () => window.setHomeTab('client-teams')
          })
        );

        if (canViewPeopleOverview()) {
          nav.appendChild(
            createHomeTabButton({
              id: 'onboarding-tab-people-overview',
              label: i18n.t('home.peopleOverview'),
              count: state.people.filter(personIsVisibleInNonAdmin).length,
              active: state.homeTab === 'people-overview',
              onClick: () => window.setHomeTab('people-overview')
            })
          );
        }

        nav.addEventListener('keydown', (event) => {
          const tabButtons = Array.from(nav.querySelectorAll('button[role="tab"]'));
          const currentIndex = tabButtons.findIndex((button) => button === document.activeElement);
          const nextIndex = resolveTabNavigationIndex(currentIndex, event.key, tabButtons.length);
          if (nextIndex < 0) return;
          event.preventDefault();
          tabButtons[nextIndex]?.focus();
        });

        tabsWrap.appendChild(nav);
        container.appendChild(tabsWrap);
      }


      window.loginFromSplash = async function loginFromSplash(event) {
        event?.preventDefault();
        try {
          const email = String(document.getElementById('login-email')?.value || '').trim();
          const password = String(document.getElementById('login-password')?.value || '');
          await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
          });
          await loadData({ forceAppData: true });
          state.authRequired = false;
          showMessage(i18n.t('auth.login.success'));
          render();
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };

      function render() {
        if (!canAccessAdmin()) state.showAdmin = false;
        const previousViewKind = lastRenderedViewKind;
        const currentViewKind = getViewKind();

        const responsiveShell = window.ProjectoryResponsiveShell || {};
        const adminToggle = document.getElementById('admin-toggle');
        if (adminToggle) adminToggle.style.display = !needsLoginScreen() && canAccessAdmin() ? '' : 'none';
        const adminToggleMobile = document.getElementById('admin-toggle-mobile');
        if (adminToggleMobile) adminToggleMobile.style.display = !needsLoginScreen() && canAccessAdmin() ? '' : 'none';
        const onboardingToggle = document.getElementById('onboarding-demo-start');
        if (onboardingToggle) onboardingToggle.style.display = needsLoginScreen() ? 'none' : '';
        const onboardingToggleMobile = document.getElementById('onboarding-demo-start-mobile');
        if (onboardingToggleMobile) onboardingToggleMobile.style.display = needsLoginScreen() ? 'none' : '';
        const logoutHidden = needsLoginScreen() || state.auth?.authSource !== 'session';
        const logoutButton = document.getElementById('auth-logout');
        if (logoutButton) logoutButton.classList.toggle('hidden', logoutHidden);
        const logoutButtonMobile = document.getElementById('auth-logout-mobile');
        if (logoutButtonMobile) logoutButtonMobile.classList.toggle('hidden', logoutHidden);
        if (typeof responsiveShell.syncHeaderControls === 'function') responsiveShell.syncHeaderControls();

        if (state.inviteFlow?.active) {
          state.showAdmin = false;
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          const viewRoot = document.getElementById('view');
          viewRoot.dataset.viewKind = 'invite';
          // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          document.getElementById('view').innerHTML = inviteFlowView();
          document.getElementById('invite-activate-form')?.addEventListener('submit', window.submitInviteActivation);
        } else if (state.resetPasswordFlow?.active) {
          state.showAdmin = false;
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          const viewRoot = document.getElementById('view');
          viewRoot.dataset.viewKind = 'reset-password';
          // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          document.getElementById('view').innerHTML = resetPasswordFlowView();
          document.getElementById('reset-password-form')?.addEventListener('submit', window.submitResetPassword);
        } else if (needsLoginScreen()) {
          state.showAdmin = false;
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          const viewRoot = document.getElementById('view');
          viewRoot.dataset.viewKind = 'login';
          // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          document.getElementById('view').innerHTML = loginScreenView();
          document.getElementById('login-form')?.addEventListener('submit', window.loginFromSplash);
          document.getElementById('forgot-password-form')?.addEventListener('submit', window.submitForgotPassword);
          document.getElementById('initial-register-form')?.addEventListener('submit', window.submitInitialRegistration);
        } else if (state.showAdmin) {
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          const viewRoot = document.getElementById('view');
          viewRoot.dataset.viewKind = 'admin';
          // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          document.getElementById('view').innerHTML = adminStandaloneView();
        } else {
        if (!canViewPeopleOverview() && state.homeTab === 'people-overview') state.homeTab = 'client-teams';
        const homeContent = state.homeTab === 'people-overview' && canViewPeopleOverview() ? peopleOverviewView() : ownershipView();
        const viewRoot = document.getElementById('view');
        renderHomeShell(viewRoot, homeContent);

        }

        document.getElementById('admin-panel').classList.add('hidden');

        bindInlineHandlers(document);
        bindForms();
        renderChallengeModal();
        renderAssignModal();
        renderUnassignModal();
        renderExportModal();
        renderImportModal();
        renderProjectStatusModal();
        renderProjectPriorityModal();
        renderPeopleOverviewModal();
        renderWorkloadModal();
        i18n.applyToDom(document);
        renderOnboardingDemo();

        if (previousViewKind !== currentViewKind) {
          focusViewHeading(currentViewKind);
        }
        lastRenderedViewKind = currentViewKind;
      }

      window.render = render;
      window.applyAppRoute = applyAppRoute;
      window.navigateFromState = navigateFromState;

