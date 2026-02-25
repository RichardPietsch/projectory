(function registerPeopleView(globalScope) {
  function renderPeopleView({ state, personLeaverBadge, personHiddenBadge }) {
    const sortedPeople = [...state.people].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
    const rows = sortedPeople
      .map((person) => `<tr class="border-t border-slate-800"><td class="p-2">${person.first_name} ${person.last_name}${personLeaverBadge(person)}${personHiddenBadge(person)}</td><td class="p-2">${person.trade_name}</td><td class="p-2">${person.level_name}</td><td class="p-2">${Number(person.working_hours || 40)}hrs</td><td class="p-2"><button class="rounded border border-slate-600 px-2 py-1 text-xs" onclick='openAdminPersonModal(${JSON.stringify(person)})'>Edit</button><button class="rounded border border-rose-500/50 px-2 py-1 text-xs text-rose-300" onclick='deletePerson(${person.id})'>Delete</button></td></tr>`)
      .join('');

    return `<div class="rounded-xl border border-slate-800 bg-slate-900 p-4"><div class="mb-3 flex items-center justify-between"><h2 class="text-lg font-semibold">People</h2><button class="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold" onclick="openAdminPersonModal()">Add Person</button></div><table class="w-full text-left text-sm"><thead><tr class="text-slate-400"><th class="p-2">Name</th><th class="p-2">Trade</th><th class="p-2">Level</th><th class="p-2">Working Hours</th><th class="p-2">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  globalScope.ProjectoryViews = {
    ...(globalScope.ProjectoryViews || {}),
    renderPeopleView
  };
})(window);
