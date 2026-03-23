(function registerClientsView(globalScope) {
  function renderClientsView({ state, renderPriorityPill }) {
    const t = globalScope.ProjectoryI18n?.t || ((key) => key);
    const sortedClients = [...state.clients].sort((a, b) => {
      const nameA = String(a.name || '').toLowerCase();
      const nameB = String(b.name || '').toLowerCase();
      const locationA = String(a.location || '').toLowerCase();
      const locationB = String(b.location || '').toLowerCase();
      const sinceA = String(a.since_month || '');
      const sinceB = String(b.since_month || '');
      const priorityA = Number(a.priority_sort_order || 9999);
      const priorityB = Number(b.priority_sort_order || 9999);
      const priorityNameA = String(a.priority_name || '').toLowerCase();
      const priorityNameB = String(b.priority_name || '').toLowerCase();
      const projectsA = Number(a.project_count || 0);
      const projectsB = Number(b.project_count || 0);

      switch (state.clientsSort) {
        case 'name_desc':
          return nameB.localeCompare(nameA);
        case 'location_asc':
          return locationA.localeCompare(locationB) || nameA.localeCompare(nameB);
        case 'location_desc':
          return locationB.localeCompare(locationA) || nameA.localeCompare(nameB);
        case 'since_asc':
          return sinceA.localeCompare(sinceB) || nameA.localeCompare(nameB);
        case 'since_desc':
          return sinceB.localeCompare(sinceA) || nameA.localeCompare(nameB);
        case 'priority_asc':
          return priorityA - priorityB || priorityNameA.localeCompare(priorityNameB) || nameA.localeCompare(nameB);
        case 'priority_desc':
          return priorityB - priorityA || priorityNameB.localeCompare(priorityNameA) || nameA.localeCompare(nameB);
        case 'projects_asc':
          return projectsA - projectsB || nameA.localeCompare(nameB);
        case 'projects_desc':
          return projectsB - projectsA || nameA.localeCompare(nameB);
        case 'name_asc':
        default:
          return nameA.localeCompare(nameB);
      }
    });

    const rows = sortedClients
      .map((client) => `<tr class="border-t border-zinc-800"><td class="p-2">${client.name}</td><td class="p-2">${client.location}</td><td class="p-2">${client.since_month}</td><td class="p-2">${renderPriorityPill(client.priority_name, client.priority_color_hex)}</td><td class="p-2">${client.project_count}</td><td class="p-2"><div class="flex flex-wrap gap-2"><button class="rounded border border-zinc-600 px-2 py-1 text-xs" onclick='openAdminClientModal(${JSON.stringify(client)})'>${t('common.edit')}</button><button class="rounded border border-rose-500/50 px-2 py-1 text-xs text-rose-300" onclick='deleteClient(${client.id})'>${t('common.delete')}</button></div></td></tr>`)
      .join('');

    const mobileCards = sortedClients
      .map((client) => `<article class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 shadow-sm"><div class="flex items-start justify-between gap-3"><div class="min-w-0 flex-1"><h3 class="text-base font-semibold text-zinc-100 break-words">${client.name}</h3><p class="mt-1 break-words text-sm text-zinc-400">${client.location}</p></div><div class="shrink-0">${renderPriorityPill(client.priority_name, client.priority_color_hex)}</div></div><dl class="mt-4 grid grid-cols-2 gap-3 text-sm"><div class="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2"><dt class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">${t('clients.columns.since')}</dt><dd class="mt-1 text-zinc-100">${client.since_month}</dd></div><div class="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2"><dt class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">${t('clients.columns.projects')}</dt><dd class="mt-1 text-zinc-100">${client.project_count}</dd></div></dl><div class="mt-4 flex flex-wrap gap-2"><button class="flex-1 rounded border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800" onclick='openAdminClientModal(${JSON.stringify(client)})'>${t('common.edit')}</button><button class="flex-1 rounded border border-rose-500/50 px-3 py-2 text-sm text-rose-300 hover:bg-zinc-800" onclick='deleteClient(${client.id})'>${t('common.delete')}</button></div></article>`)
      .join('');

    return `<div class="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 class="text-lg font-semibold">${t('entity.clients')}</h2><button class="rounded bg-[#00d8ff] px-3 py-2 text-sm font-semibold text-zinc-950" onclick="openAdminClientModal()">${t('clients.add')}</button></div><div id="admin-clients-mobile-list" class="space-y-3 md:hidden">${mobileCards}</div><div class="hidden md:block overflow-x-auto"><table class="w-full min-w-[780px] text-left text-sm"><thead><tr class="text-zinc-400"><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-zinc-100" onclick="setClientsSortField('name')">${t('clients.columns.name')} ${state.clientsSort.startsWith('name_') ? (state.clientsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-zinc-100" onclick="setClientsSortField('location')">${t('clients.columns.location')} ${state.clientsSort.startsWith('location_') ? (state.clientsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-zinc-100" onclick="setClientsSortField('since')">${t('clients.columns.since')} ${state.clientsSort.startsWith('since_') ? (state.clientsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-zinc-100" onclick="setClientsSortField('priority')">${t('clients.columns.priority')} ${state.clientsSort.startsWith('priority_') ? (state.clientsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-zinc-100" onclick="setClientsSortField('projects')">${t('clients.columns.projects')} ${state.clientsSort.startsWith('projects_') ? (state.clientsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2">${t('common.actions')}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  globalScope.ProjectoryViews = {
    ...(globalScope.ProjectoryViews || {}),
    renderClientsView
  };
})(window);
