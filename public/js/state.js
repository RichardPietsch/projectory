(function registerProjectoryState(globalScope) {
  function createInitialState() {
    return {
      showAdmin: false,
      adminTab: 'people',
      homeTab: 'client-teams',
      selectedProjectId: '',
      meta: { trades: [], levels: [], priorities: [] },
      people: [],
      clients: [],
      projectsPayload: { projects: [], challenges: [], assignments: [] },
      auth: { role: 'admin', permissions: [] },
      assignModal: {
        open: false,
        challengeId: null,
        challengeTitle: '',
        assignmentId: null,
        selectedPersonId: '',
        search: '',
        role: 'contributor'
      },
      unassignModal: {
        open: false,
        challengeId: null,
        challengeTitle: '',
        selectedAssignmentIds: []
      },
      challengeModal: {
        open: false,
        challengeId: null,
        returnToPeopleOverview: false,
        returnPersonId: null
      },
      projectStatusModal: {
        open: false,
        projectId: null,
        status: 'white'
      },
      projectPriorityModal: {
        open: false,
        clientId: null,
        priorityId: null
      },
      workloadModal: {
        open: false,
        projectId: null,
        personId: null,
        quantity: 0,
        keepModalOpen: false
      },
      listenersBound: {
        header: false,
        footer: false,
        assignModal: false,
        unassignModal: false,
        challengeModal: false,
        challengeModalForm: false,
        exportModal: false,
        importModal: false,
        peopleOverviewModal: false,
        adminEntityModals: false,
        projectStatusModal: false,
        projectPriorityModal: false,
        workloadModal: false
      },
      assignSubmitting: false,
      challengeSubmitting: false,
      peopleSort: 'name_asc',
      clientsSort: 'name_asc',
      adminProjectsSort: 'project_asc',
      challengesSort: 'title_asc',
      clientTeamsSort: 'status_desc',
      clientTeamsSearch: '',
      exportModalOpen: false,
      exportScope: 'app',
      importModalOpen: false,
      importScope: 'app',
      importPreviewData: null,
      configuration: { trades: [], levels: [] },
      configurationDraft: { trades: [], levels: [] },
      adminUsers: [],
      smtpSettings: { host: '', port: '', username: '', fromEmail: '', secure: true, enabled: false, passwordSet: false },
      smtpTestRecipient: '',
      auditEntries: [],
      peopleOverviewSort: 'name_asc',
      peopleOverviewSearch: '',
      peopleOverviewModal: { open: false, personId: null },
      forgotPassword: { submitting: false, submitted: false, error: '' },
      resetPasswordFlow: { active: false, token: '', submitting: false, done: false, error: '' },
      inviteFlow: { active: false, token: '', loading: false, submitting: false, profile: null, error: '' }
    };
  }

  globalScope.ProjectoryState = {
    createInitialState
  };
})(window);
