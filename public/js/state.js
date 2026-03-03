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
        projectPriorityModal: false
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
      auditEntries: [],
      peopleOverviewSort: 'name_asc',
      peopleOverviewSearch: '',
      peopleOverviewModal: { open: false, personId: null }
    };
  }

  globalScope.ProjectoryState = {
    createInitialState
  };
})(window);
