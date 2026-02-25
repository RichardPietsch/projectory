(function registerLocaleEn(globalScope) {
  const messages = {
    'app.title': 'Projectory',
    'app.tagline': 'A challenge-first ownership approach for setting up autonomous client-teams',
    'header.openAdministration': 'Open Administration',
    'header.admin': 'Admin',
    'header.language': 'Language',
    'locale.en': 'English',
    'locale.de': 'Deutsch',

    'common.close': 'Close',
    'common.cancel': 'Cancel',
    'common.export': 'Export',
    'common.import': 'Import',
    'common.backToApp': 'Back to app',
    'common.actions': 'Actions',
    'common.edit': 'Edit',
    'common.delete': 'Delete',
    'common.open': 'open',

    'admin.mode': 'Administration Mode',
    'admin.title': 'Administration',
    'admin.tabs.people': 'People View',
    'admin.tabs.clients': 'Client View',
    'admin.tabs.projects': 'Project View',

    'home.clientTeams': 'Client Teams',
    'home.peopleOverview': 'People Overview',

    'modal.export.title': 'Export data',
    'modal.import.title': 'Import data',
    'modal.format': 'Format',
    'modal.import.warning': '⚠️ Warning: importing will replace and permanently delete all current data.',
    'modal.import.summary': 'Import summary:',
    'modal.import.confirm': 'Confirm Import',
    'modal.projectStatus.title': 'Update project status',
    'modal.projectStatus.status': 'Status',

    'entity.people': 'People',
    'entity.clients': 'Clients',
    'entity.projects': 'Projects',
    'entity.challenges': 'Challenges',
    'entity.assignments': 'Assignments',

    'clients.add': 'Add Client',
    'clients.columns.name': 'Name',
    'clients.columns.location': 'Location',
    'clients.columns.since': 'Since',
    'clients.columns.priority': 'Priority',
    'clients.columns.projects': 'Projects',

    'projects.add': 'Add Project',
    'projects.columns.project': 'Project',
    'projects.columns.dates': 'Dates',
    'projects.columns.budget': 'Budget',

    'projectStatus.green': 'Formed Team',
    'projectStatus.blue': 'In Progress',
    'projectStatus.yellow': 'Needs Attention',
    'projectStatus.red': 'Needs Problem-Solving',
    'projectStatus.white': 'New'
  };

  globalScope.ProjectoryLocales = {
    ...(globalScope.ProjectoryLocales || {}),
    en: messages
  };
})(window);
