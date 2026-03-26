(function registerPeopleView(globalScope) {
  function renderPeopleView({ state, personLeaverBadge, personHiddenBadge }) {
    const t = globalScope.ProjectoryI18n?.t || ((key) => key);
    const sortedPeople = [...state.people].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
    const rows = sortedPeople
      .map((person) => `<tr class="ui-table-row"><td class="p-2">${person.first_name} ${person.last_name}${personLeaverBadge(person)}${personHiddenBadge(person)}</td><td class="ui-text-secondary p-2">${person.trade_name}</td><td class="ui-text-secondary p-2">${person.level_name}</td><td class="ui-text-secondary p-2">${Number(person.working_hours || 40)}${t('people.hoursSuffix')}</td><td class="p-2"><div class="flex flex-wrap gap-2"><button class="ui-btn ui-btn-secondary px-2 py-1 text-xs" onclick='openAdminPersonModal(${JSON.stringify(person)})'>${t('common.edit')}</button><button class="ui-btn ui-btn-danger px-2 py-1 text-xs" onclick='deletePerson(${person.id})'>${t('common.delete')}</button></div></td></tr>`)
      .join('');

    const mobileCards = sortedPeople
      .map((person) => `<article class="ui-mobile-card p-4"><div class="flex items-start justify-between gap-3"><div class="min-w-0 flex-1"><h3 class="ui-section-title text-base font-semibold break-words">${person.first_name} ${person.last_name}</h3><div class="mt-2 flex flex-wrap gap-2">${personLeaverBadge(person)}${personHiddenBadge(person)}</div></div><div class="ui-text-muted text-right text-xs"><div>${t('people.columns.workingHours')}</div><div class="ui-section-title mt-1 font-semibold">${Number(person.working_hours || 40)}${t('people.hoursSuffix')}</div></div></div><dl class="mt-4 grid grid-cols-2 gap-3 text-sm"><div class="ui-stat-card px-3 py-2"><dt class="ui-text-muted text-[11px] font-semibold uppercase tracking-[0.16em]">${t('people.columns.trade')}</dt><dd class="ui-section-title mt-1 break-words">${person.trade_name}</dd></div><div class="ui-stat-card px-3 py-2"><dt class="ui-text-muted text-[11px] font-semibold uppercase tracking-[0.16em]">${t('people.columns.level')}</dt><dd class="ui-section-title mt-1 break-words">${person.level_name}</dd></div></dl><div class="mt-4 flex flex-wrap gap-2"><button class="ui-btn ui-btn-secondary flex-1 px-3 py-2 text-sm" onclick='openAdminPersonModal(${JSON.stringify(person)})'>${t('common.edit')}</button><button class="ui-btn ui-btn-danger flex-1 px-3 py-2 text-sm" onclick='deletePerson(${person.id})'>${t('common.delete')}</button></div></article>`)
      .join('');

    return `<div class="ui-panel p-4"><div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 class="text-lg font-semibold">${t('entity.people')}</h2><button class="ui-btn ui-btn-primary px-3 py-2 text-sm" onclick="openAdminPersonModal()">${t('people.add')}</button></div><div id="admin-people-mobile-list" class="space-y-3 md:hidden">${mobileCards}</div><div class="hidden md:block overflow-x-auto"><table class="w-full min-w-[700px] text-left text-sm"><thead><tr class="ui-table-head"><th class="p-2">${t('people.columns.name')}</th><th class="p-2">${t('people.columns.trade')}</th><th class="p-2">${t('people.columns.level')}</th><th class="p-2">${t('people.columns.workingHours')}</th><th class="p-2">${t('common.actions')}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  globalScope.ProjectoryViews = {
    ...(globalScope.ProjectoryViews || {}),
    renderPeopleView
  };
})(window);
