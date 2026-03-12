      const state = window.ProjectoryState.createInitialState();
      const i18n = window.ProjectoryI18n;
      const onboardingTour = window.ProjectoryOnboardingTour;

      const adminTabs = [
        { id: 'people', labelKey: 'admin.tabs.people' },
        { id: 'clients', labelKey: 'admin.tabs.clients' },
        { id: 'projects', labelKey: 'admin.tabs.projects' },
        { id: 'configuration', labelKey: 'admin.tabs.configuration' },
        { id: 'access', labelKey: 'admin.tabs.access' }
      ];

      const CHALLENGE_TITLE_PREFILL = 'Placeholder Challenge';
      const CHALLENGE_DESCRIPTION_PREFILL = 'Please edit this to reflect an actual challenge!';

      const onboardingDemo = {
        open: false,
        stepIndex: 0,
        listenersBound: false,
        highlightedElement: null,
        steps: [
          {
            id: 'welcome',
            target: '#app-logo-button',
            titleKey: 'onboarding.demo.step1.title',
            descriptionKey: 'onboarding.demo.step1.description',
            onEnter: () => {
              state.showAdmin = false;
              state.homeTab = 'client-teams';
              state.selectedProjectId = '';
              navigateFromState();
              render();
            }
          },
          {
            id: 'project-overview',
            target: '#onboarding-project-overview-table',
            titleKey: 'onboarding.demo.step2.title',
            descriptionKey: 'onboarding.demo.step2.description',
            onEnter: () => {
              state.showAdmin = false;
              state.homeTab = 'client-teams';
              state.selectedProjectId = '';
              navigateFromState();
              render();
            }
          },
          {
            id: 'challenge-overview',
            target: '#onboarding-challenge-overview',
            titleKey: 'onboarding.demo.step3.title',
            descriptionKey: 'onboarding.demo.step3.description',
            onEnter: () => {
              state.showAdmin = false;
              state.homeTab = 'client-teams';
              const hasProject52 = state.projectsPayload.projects.some((project) => Number(project.id) === 52);
              state.selectedProjectId = hasProject52 ? '52' : String(state.projectsPayload.projects[0]?.id || '');
              navigateFromState();
              render();
            }
          },
          {
            id: 'add-challenge',
            target: '#onboarding-add-challenge',
            titleKey: 'onboarding.demo.step4.title',
            descriptionKey: 'onboarding.demo.step4.description'
          },
          {
            id: 'project-team-overview',
            target: '#onboarding-project-team-overview',
            titleKey: 'onboarding.demo.step5.title',
            descriptionKey: 'onboarding.demo.step5.description'
          },
          {
            id: 'client-owners',
            target: '#onboarding-client-owners',
            titleKey: 'onboarding.demo.step6.title',
            descriptionKey: 'onboarding.demo.step6.description'
          },
          {
            id: 'client-leaders',
            target: '#onboarding-client-leaders',
            titleKey: 'onboarding.demo.step7.title',
            descriptionKey: 'onboarding.demo.step7.description'
          },
          {
            id: 'contributors',
            target: '#onboarding-contributors',
            titleKey: 'onboarding.demo.step8.title',
            descriptionKey: 'onboarding.demo.step8.description'
          },
          {
            id: 'people-overview',
            target: '#onboarding-people-overview-table',
            titleKey: 'onboarding.demo.step9.title',
            descriptionKey: 'onboarding.demo.step9.description',
            onEnter: () => {
              state.showAdmin = false;
              state.homeTab = 'people-overview';
              state.selectedProjectId = '';
              navigateFromState();
              render();
            }
          },
          {
            id: 'wrap-up',
            target: null,
            titleKey: 'onboarding.demo.step10.title',
            descriptionKey: 'onboarding.demo.step10.description',
            onEnter: () => {
              state.showAdmin = false;
              state.homeTab = 'client-teams';
              state.selectedProjectId = '';
              navigateFromState();
              render();
            }
          }
        ]
      };



      async function init() {
        try {
          await loadData();
          const localeSelect = document.getElementById('locale-select');
          if (localeSelect) localeSelect.value = i18n.getLocale();
          i18n.applyToDom(document);
        renderOnboardingDemo();

          bindHeaderActions();
          bindOnboardingDemoActions();
          bindFooterActions();
          bindChallengeModalActions();
          bindAssignModalActions();
          bindUnassignModalActions();
          bindExportModalActions();
          bindImportModalActions();
          bindProjectStatusModalActions();
          bindPeopleOverviewModalActions();
          bindWorkloadModalActions();
          bindAdminEntityModalActions();
          bindAdminUserModalActions();

          const params = new URLSearchParams(window.location.search || '');
          const inviteToken = String(params.get('token') || '').trim();
          if (window.location.pathname === '/invite') {
            state.inviteFlow.active = true;
            state.resetPasswordFlow.active = false;
            state.inviteFlow.token = inviteToken;
            await loadInviteFlow(inviteToken);
          } else if (window.location.pathname === '/reset-password') {
            state.inviteFlow.active = false;
            state.resetPasswordFlow.active = true;
            state.resetPasswordFlow.token = String(params.get('token') || '').trim();
          } else if (!needsLoginScreen() && !applyAppRoute(window.location.pathname)) {
            state.homeTab = 'client-teams';
            state.selectedProjectId = '';
            state.peopleOverviewModal.open = false;
            state.peopleOverviewModal.personId = null;
            state.showAdmin = false;
            state.adminTab = 'people';
            navigateFromState(false);
          }

          window.addEventListener('popstate', () => {
            if (window.location.pathname === '/invite') {
              const params = new URLSearchParams(window.location.search || '');
              state.inviteFlow.active = true;
              state.resetPasswordFlow.active = false;
              state.inviteFlow.token = String(params.get('token') || '').trim();
              loadInviteFlow(state.inviteFlow.token).then(() => render());
              return;
            }
            if (window.location.pathname === '/reset-password') {
              const params = new URLSearchParams(window.location.search || '');
              state.inviteFlow.active = false;
              state.resetPasswordFlow.active = true;
              state.resetPasswordFlow.token = String(params.get('token') || '').trim();
              render();
              return;
            }
            state.inviteFlow.active = false;
            state.resetPasswordFlow.active = false;
            if (!needsLoginScreen()) applyAppRoute(window.location.pathname);
            render();
          });

          render();
        } catch (error) {
          showMessage(error.message, 'error');
        }
      }

      init();
