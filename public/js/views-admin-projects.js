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
      .map(
        (project) => `<tr class="border-t border-slate-800">
              <td class="p-2">${project.name}<div class="text-xs text-slate-400">${project.client_name}</div></td>
              <td class="p-2">${project.start_month} → ${project.end_month || t('common.open')}</td>
              <td class="p-2">€ ${Math.round(Number(project.budget_cents || 0) / 100).toLocaleString('de-DE')}</td>
              <td class="p-2">
                <button class="rounded border border-slate-600 px-2 py-1 text-xs" onclick='openAdminProjectModal(${JSON.stringify(project)})'>${t('common.edit')}</button>
                <button class="rounded border border-rose-500/50 px-2 py-1 text-xs text-rose-300" onclick='deleteProject(${project.id})'>${t('common.delete')}</button>
              </td>
            </tr>`
      )
      .join('');

    return `<div class="rounded-xl border border-slate-800 bg-slate-900 p-4"><div class="mb-3 flex items-center justify-between"><h2 class="text-lg font-semibold">${t('entity.projects')}</h2><button class="rounded bg-[#00d8ff] text-slate-950 px-3 py-2 text-sm font-semibold" onclick="openAdminProjectModal()">${t('projects.add')}</button></div><table class="w-full text-left text-sm"><thead><tr class="text-slate-400"><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-slate-100" onclick="setAdminProjectsSortField('project')">${t('projects.columns.project')} ${state.adminProjectsSort.startsWith('project_') ? (state.adminProjectsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-slate-100" onclick="setAdminProjectsSortField('dates')">${t('projects.columns.dates')} ${state.adminProjectsSort.startsWith('dates_') ? (state.adminProjectsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-slate-100" onclick="setAdminProjectsSortField('budget')">${t('projects.columns.budget')} ${state.adminProjectsSort.startsWith('budget_') ? (state.adminProjectsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2">${t('common.actions')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  globalScope.ProjectoryViews = {
    ...(globalScope.ProjectoryViews || {}),
    renderAdministrationProjectsView
  };
})(window);
