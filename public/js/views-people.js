(function registerPeopleView(globalScope) {
  function renderPeopleView({ state, personLeaverBadge, personHiddenBadge }) {
    const t = globalScope.ProjectoryI18n?.t || ((key) => key);
    const sortedPeople = [...state.people].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
    const rows = sortedPeople
      .map((person) => `<tr class="border-t border-slate-800"><td class="p-2">${person.first_name} ${person.last_name}${personLeaverBadge(person)}${personHiddenBadge(person)}</td><td class="p-2">${person.trade_name}</td><td class="p-2">${person.level_name}</td><td class="p-2">${Number(person.working_hours || 40)}${t('people.hoursSuffix')}</td><td class="p-2"><button class="rounded border border-slate-600 px-2 py-1 text-xs" onclick='openAdminPersonModal(${JSON.stringify(person)})'>${t('common.edit')}</button><button class="rounded border border-rose-500/50 px-2 py-1 text-xs text-rose-300" onclick='deletePerson(${person.id})'>${t('common.delete')}</button></td></tr>`)
      .join('');

    return `<div class="rounded-xl border border-slate-800 bg-slate-900 p-4"><div class="mb-3 flex items-center justify-between"><h2 class="text-lg font-semibold">${t('entity.people')}</h2><button class="rounded bg-[#00d8ff] text-slate-950 px-3 py-2 text-sm font-semibold" onclick="openAdminPersonModal()">${t('people.add')}</button></div><table class="w-full text-left text-sm"><thead><tr class="text-slate-400"><th class="p-2">${t('people.columns.name')}</th><th class="p-2">${t('people.columns.trade')}</th><th class="p-2">${t('people.columns.level')}</th><th class="p-2">${t('people.columns.workingHours')}</th><th class="p-2">${t('common.actions')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  globalScope.ProjectoryViews = {
    ...(globalScope.ProjectoryViews || {}),
    renderPeopleView
  };
})(window);
