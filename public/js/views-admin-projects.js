(function registerAdminProjectsView(globalScope) {
  function renderAdministrationProjectsView({ state }) {
    const t = globalScope.ProjectoryI18n?.t || ((key) => key);
    const projects = state.projectsPayload.projects;
    const sortedProjects = [...projects].sort((a, b) => {
      const projectA = String(a.name || '').toLowerCase();
      const projectB = String(b.name || '').toLowerCase();
      const datesA = `${a.start_month || ''}-${a.end_month || ''}`;
      const datesB = `${b.start_month || ''}-${b.end_month || ''}`;
      const budgetA = Number(a.budget_cents || 0);
      const budgetB = Number(b.budget_cents || 0);

      switch (state.adminProjectsSort) {
        case 'project_desc':
          return projectB.localeCompare(projectA);
        case 'dates_asc':
          return datesA.localeCompare(datesB) || projectA.localeCompare(projectB);
        case 'dates_desc':
          return datesB.localeCompare(datesA) || projectA.localeCompare(projectB);
        case 'budget_asc':
          return budgetA - budgetB || projectA.localeCompare(projectB);
        case 'budget_desc':
          return budgetB - budgetA || projectA.localeCompare(projectB);
        case 'project_asc':
        default:
          return projectA.localeCompare(projectB);
      }
    });

    const rows = sortedProjects
      .map((project) => `<tr class="ui-table-row"><td class="p-2">${project.name}<div class="ui-text-muted text-xs">${project.client_name}</div></td><td class="ui-text-secondary p-2">${project.start_month} → ${project.end_month || t('common.open')}</td><td class="ui-text-secondary p-2">€ ${Math.round(Number(project.budget_cents || 0) / 100).toLocaleString('de-DE')}</td><td class="p-2"><div class="flex flex-wrap gap-2"><button class="ui-btn ui-btn-secondary px-2 py-1 text-xs" onclick='openAdminProjectModal(${JSON.stringify(project)})'>${t('common.edit')}</button><button class="ui-btn ui-btn-danger px-2 py-1 text-xs" onclick='deleteProject(${project.id})'>${t('common.delete')}</button></div></td></tr>`)
      .join('');

    const mobileCards = sortedProjects
      .map((project) => `<article class="ui-mobile-card p-4"><div class="flex items-start justify-between gap-3"><div class="min-w-0 flex-1"><h3 class="ui-section-title text-base font-semibold break-words">${project.name}</h3><p class="ui-text-muted mt-1 break-words text-sm">${project.client_name}</p></div><div class="ui-section-title text-right text-sm font-semibold">€ ${Math.round(Number(project.budget_cents || 0) / 100).toLocaleString('de-DE')}</div></div><div class="ui-stat-card mt-4 px-3 py-2"><div class="ui-text-muted text-[11px] font-semibold uppercase tracking-[0.16em]">${t('projects.columns.dates')}</div><div class="ui-section-title mt-1 break-words text-sm">${project.start_month} → ${project.end_month || t('common.open')}</div></div><div class="mt-4 flex flex-wrap gap-2"><button class="ui-btn ui-btn-secondary flex-1 px-3 py-2 text-sm" onclick='openAdminProjectModal(${JSON.stringify(project)})'>${t('common.edit')}</button><button class="ui-btn ui-btn-danger flex-1 px-3 py-2 text-sm" onclick='deleteProject(${project.id})'>${t('common.delete')}</button></div></article>`)
      .join('');

    return `<div class="ui-panel p-4"><div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 class="text-lg font-semibold">${t('entity.projects')}</h2><button class="ui-btn ui-btn-primary px-3 py-2 text-sm" onclick="openAdminProjectModal()">${t('projects.add')}</button></div><div id="admin-projects-mobile-list" class="space-y-3 md:hidden">${mobileCards}</div><div class="hidden md:block overflow-x-auto"><table class="w-full min-w-[760px] text-left text-sm"><thead><tr class="ui-table-head"><th class="p-2"><button class="ui-sort-button inline-flex items-center gap-1" onclick="setAdminProjectsSortField('project')">${t('projects.columns.project')} ${state.adminProjectsSort.startsWith('project_') ? (state.adminProjectsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2"><button class="ui-sort-button inline-flex items-center gap-1" onclick="setAdminProjectsSortField('dates')">${t('projects.columns.dates')} ${state.adminProjectsSort.startsWith('dates_') ? (state.adminProjectsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2"><button class="ui-sort-button inline-flex items-center gap-1" onclick="setAdminProjectsSortField('budget')">${t('projects.columns.budget')} ${state.adminProjectsSort.startsWith('budget_') ? (state.adminProjectsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2">${t('common.actions')}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  globalScope.ProjectoryViews = {
    ...(globalScope.ProjectoryViews || {}),
    renderAdministrationProjectsView
  };
})(window);
