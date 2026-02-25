(function registerClientsView(globalScope) {
  function renderClientsView({ state, renderPriorityPill }) {
    const sortedClients = [...state.clients].sort((a, b) => {
      const nameA = String(a.name || '').toLowerCase();
      const nameB = String(b.name || '').toLowerCase();
      const locationA = String(a.location || '').toLowerCase();
      const locationB = String(b.location || '').toLowerCase();
      const sinceA = String(a.since_month || '');
      const sinceB = String(b.since_month || '');
      const priorityA = String(a.priority_name || '').toLowerCase();
      const priorityB = String(b.priority_name || '').toLowerCase();
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
          return priorityA.localeCompare(priorityB) || nameA.localeCompare(nameB);
        case 'priority_desc':
          return priorityB.localeCompare(priorityA) || nameA.localeCompare(nameB);
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
      .map(
        (client) => `<tr class="border-t border-slate-800">
              <td class="p-2">${client.name}</td>
              <td class="p-2">${client.location}</td>
              <td class="p-2">${client.since_month}</td>
              <td class="p-2">${renderPriorityPill(client.priority_name)}</td>
              <td class="p-2">${client.project_count}</td>
              <td class="p-2">
                <button class="rounded border border-slate-600 px-2 py-1 text-xs" onclick='openAdminClientModal(${JSON.stringify(client)})'>Edit</button>
                <button class="rounded border border-rose-500/50 px-2 py-1 text-xs text-rose-300" onclick='deleteClient(${client.id})'>Delete</button>
              </td>
            </tr>`
      )
      .join('');

    return `<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div class="mb-3 flex items-center justify-between"><h2 class="text-lg font-semibold">Clients</h2><button class="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold" onclick="openAdminClientModal()">Add Client</button></div>
              <table class="w-full text-left text-sm">
              
                <thead><tr class="text-slate-400"><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-slate-100" onclick="setClientsSortField('name')">Name ${state.clientsSort.startsWith('name_') ? (state.clientsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-slate-100" onclick="setClientsSortField('location')">Location ${state.clientsSort.startsWith('location_') ? (state.clientsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-slate-100" onclick="setClientsSortField('since')">Since ${state.clientsSort.startsWith('since_') ? (state.clientsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-slate-100" onclick="setClientsSortField('priority')">Priority ${state.clientsSort.startsWith('priority_') ? (state.clientsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2"><button class="inline-flex items-center gap-1 hover:text-slate-100" onclick="setClientsSortField('projects')">Projects ${state.clientsSort.startsWith('projects_') ? (state.clientsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="p-2">Actions</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`;
  }

  globalScope.ProjectoryViews = {
    ...(globalScope.ProjectoryViews || {}),
    renderClientsView
  };
})(window);
