(function registerLocaleDe(globalScope) {
  const messages = {
    'app.title': 'Projectory',
    'app.tagline': 'Ein challenge-orientierter Ownership-Ansatz zum Aufbau autonomer Kundenteams',
    'header.openAdministration': 'Administration öffnen',
    'header.admin': 'Admin',
    'header.language': 'Sprache',
    'locale.en': 'English',
    'locale.de': 'Deutsch',

    'common.close': 'Schließen',
    'common.cancel': 'Abbrechen',
    'common.export': 'Exportieren',
    'common.import': 'Importieren',
    'common.backToApp': 'Zurück zur App',
    'common.actions': 'Aktionen',
    'common.edit': 'Bearbeiten',
    'common.delete': 'Löschen',
    'common.open': 'offen',

    'admin.mode': 'Administrationsmodus',
    'admin.title': 'Administration',
    'admin.tabs.people': 'Personenansicht',
    'admin.tabs.clients': 'Kundenansicht',
    'admin.tabs.projects': 'Projektansicht',

    'home.clientTeams': 'Kundenteams',
    'home.peopleOverview': 'Personenübersicht',

    'modal.export.title': 'Daten exportieren',
    'modal.import.title': 'Daten importieren',
    'modal.format': 'Format',
    'modal.import.warning': '⚠️ Warnung: Beim Import werden alle aktuellen Daten ersetzt und dauerhaft gelöscht.',
    'modal.import.summary': 'Import-Zusammenfassung:',
    'modal.import.confirm': 'Import bestätigen',
    'modal.projectStatus.title': 'Projektstatus aktualisieren',
    'modal.projectStatus.status': 'Status',

    'entity.people': 'Personen',
    'entity.clients': 'Kunden',
    'entity.projects': 'Projekte',
    'entity.challenges': 'Challenges',
    'entity.assignments': 'Zuweisungen',

    'clients.add': 'Kunde hinzufügen',
    'clients.columns.name': 'Name',
    'clients.columns.location': 'Standort',
    'clients.columns.since': 'Seit',
    'clients.columns.priority': 'Priorität',
    'clients.columns.projects': 'Projekte',

    'projects.add': 'Projekt hinzufügen',
    'projects.columns.project': 'Projekt',
    'projects.columns.dates': 'Zeitraum',
    'projects.columns.budget': 'Budget',

    'projectStatus.green': 'Team gebildet',
    'projectStatus.blue': 'In Bearbeitung',
    'projectStatus.yellow': 'Benötigt Aufmerksamkeit',
    'projectStatus.red': 'Benötigt Problemlösung',
    'projectStatus.white': 'Neu'
  };

  globalScope.ProjectoryLocales = {
    ...(globalScope.ProjectoryLocales || {}),
    de: messages
  };
})(window);
