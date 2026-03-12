      function trimSlashes(value) {
        let normalized = String(value || '/');
        while (normalized.startsWith('/')) normalized = normalized.slice(1);
        while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
        return normalized;
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
        const tabs = adminTabs.map((tab) => `<button class="rounded-lg border px-4 py-2 text-sm font-semibold ${state.adminTab === tab.id ? 'border-[#00d8ff] bg-[#00d8ff]/15 text-[#7cecff]' : 'border-slate-700 bg-slate-900 text-slate-300'}" onclick="setAdminTab('${tab.id}')">${i18n.t(tab.labelKey)}</button>`).join('');
        const body = state.adminTab === 'people' ? peopleView() : state.adminTab === 'clients' ? clientsView() : state.adminTab === 'projects' ? administrationProjectsView() : state.adminTab === 'access' ? accessManagementView() : configurationView();
        return `<div class="space-y-4"><div class="flex items-center justify-between"><h2 class="text-2xl font-bold">${i18n.t('admin.title')}</h2><button class="rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800" onclick="closeAdminStandalone()">${i18n.t('common.backToApp')}</button></div><div class="flex gap-2">${tabs}</div>${body}<footer class="mt-6 border-t border-slate-800 pt-4 text-sm text-slate-300"><div class="flex flex-wrap items-center gap-3"><button id="export-btn" class="rounded border border-slate-600 px-3 py-2 hover:bg-slate-800">${i18n.t('common.export')}</button><button id="import-btn" class="rounded border border-slate-600 px-3 py-2 hover:bg-slate-800">${i18n.t('common.import')}</button></div></footer></div>`;
      }

      window.setAdminTab = function setAdminTab(tabId) { if (!canAccessAdmin()) return; state.adminTab = tabId; state.showAdmin = true; navigateFromState(); render(); };
      window.closeAdminStandalone = function closeAdminStandalone() { state.showAdmin = false; navigateFromState(); render(); };

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

        const adminToggle = document.getElementById('admin-toggle');
        if (adminToggle) adminToggle.style.display = !needsLoginScreen() && canAccessAdmin() ? '' : 'none';
        const onboardingToggle = document.getElementById('onboarding-demo-start');
        if (onboardingToggle) onboardingToggle.style.display = needsLoginScreen() ? 'none' : '';
        const logoutButton = document.getElementById('auth-logout');
        if (logoutButton) logoutButton.classList.toggle('hidden', needsLoginScreen() || state.auth?.authSource !== 'session');

        if (state.inviteFlow?.active) {
          state.showAdmin = false;
          document.getElementById('view').innerHTML = inviteFlowView();
          document.getElementById('invite-activate-form')?.addEventListener('submit', window.submitInviteActivation);
        } else if (state.resetPasswordFlow?.active) {
          state.showAdmin = false;
          document.getElementById('view').innerHTML = resetPasswordFlowView();
          document.getElementById('reset-password-form')?.addEventListener('submit', window.submitResetPassword);
        } else if (needsLoginScreen()) {
          state.showAdmin = false;
          document.getElementById('view').innerHTML = loginScreenView();
          document.getElementById('login-form')?.addEventListener('submit', window.loginFromSplash);
          document.getElementById('forgot-password-form')?.addEventListener('submit', window.submitForgotPassword);
          document.getElementById('initial-register-form')?.addEventListener('submit', window.submitInitialRegistration);
        } else if (state.showAdmin) {
          document.getElementById('view').innerHTML = adminStandaloneView();
        } else {
        if (!canViewPeopleOverview() && state.homeTab === 'people-overview') state.homeTab = 'client-teams';
        const peopleTab = canViewPeopleOverview()
          ? `<button class="inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold ${state.homeTab === 'people-overview' ? 'border-[#00d8ff] text-[#00d8ff]' : 'border-transparent text-slate-400 hover:text-slate-200'}" id="onboarding-tab-people-overview" onclick="setHomeTab('people-overview')"><span class="iconify text-base" data-icon="mdi:badge-account" aria-hidden="true"></span><span>${i18n.t('home.peopleOverview')}</span><span class="rounded-full bg-current/15 px-2 py-0.5 text-xs">${state.people.filter(personIsVisibleInNonAdmin).length}</span></button>`
          : '';
        const homeTabs = `<div class="mb-4 border-b border-slate-800"><nav class="-mb-px flex gap-6" aria-label="Homepage tabs"><button class="inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold ${state.homeTab === 'client-teams' ? 'border-[#00d8ff] text-[#00d8ff]' : 'border-transparent text-slate-400 hover:text-slate-200'}" id="onboarding-tab-client-teams" onclick="setHomeTab('client-teams')"><span class="iconify text-base" data-icon="mdi:karate" aria-hidden="true"></span><span>${i18n.t('home.clientTeams')}</span><span class="rounded-full bg-current/15 px-2 py-0.5 text-xs">${state.projectsPayload.projects.length}</span></button>${peopleTab}</nav></div>`;
        const homeContent = state.homeTab === 'people-overview' && canViewPeopleOverview() ? peopleOverviewView() : ownershipView();
        document.getElementById('view').innerHTML = homeTabs + homeContent;

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
      }

