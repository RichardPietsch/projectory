(function registerPeopleView(globalScope) {
  function renderPeopleView({ state, personLeaverBadge, personHiddenBadge }) {
    const t = globalScope.ProjectoryI18n?.t || ((key) => key);
    const sortedPeople = [...state.people].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
    const rows = sortedPeople
      .map((person) => `<tr class="border-t border-zinc-800"><td class="p-2">${person.first_name} ${person.last_name}${personLeaverBadge(person)}${personHiddenBadge(person)}</td><td class="p-2">${person.trade_name}</td><td class="p-2">${person.level_name}</td><td class="p-2">${Number(person.working_hours || 40)}${t('people.hoursSuffix')}</td><td class="p-2"><div class="flex flex-wrap gap-2"><button class="rounded border border-zinc-600 px-2 py-1 text-xs" onclick='openAdminPersonModal(${JSON.stringify(person)})'>${t('common.edit')}</button><button class="rounded border border-rose-500/50 px-2 py-1 text-xs text-rose-300" onclick='deletePerson(${person.id})'>${t('common.delete')}</button></div></td></tr>`)
      .join('');

    const mobileCards = sortedPeople
      .map((person) => `<article class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 shadow-sm"><div class="flex items-start justify-between gap-3"><div class="min-w-0 flex-1"><h3 class="text-base font-semibold text-zinc-100 break-words">${person.first_name} ${person.last_name}</h3><div class="mt-2 flex flex-wrap gap-2">${personLeaverBadge(person)}${personHiddenBadge(person)}</div></div><div class="text-right text-xs text-zinc-400"><div>${t('people.columns.workingHours')}</div><div class="mt-1 font-semibold text-zinc-100">${Number(person.working_hours || 40)}${t('people.hoursSuffix')}</div></div></div><dl class="mt-4 grid grid-cols-2 gap-3 text-sm"><div class="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2"><dt class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">${t('people.columns.trade')}</dt><dd class="mt-1 break-words text-zinc-100">${person.trade_name}</dd></div><div class="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2"><dt class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">${t('people.columns.level')}</dt><dd class="mt-1 break-words text-zinc-100">${person.level_name}</dd></div></dl><div class="mt-4 flex flex-wrap gap-2"><button class="flex-1 rounded border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800" onclick='openAdminPersonModal(${JSON.stringify(person)})'>${t('common.edit')}</button><button class="flex-1 rounded border border-rose-500/50 px-3 py-2 text-sm text-rose-300 hover:bg-zinc-800" onclick='deletePerson(${person.id})'>${t('common.delete')}</button></div></article>`)
      .join('');

    return `<div class="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 class="text-lg font-semibold">${t('entity.people')}</h2><button class="rounded bg-[#00d8ff] px-3 py-2 text-sm font-semibold text-zinc-950" onclick="openAdminPersonModal()">${t('people.add')}</button></div><div id="admin-people-mobile-list" class="space-y-3 md:hidden">${mobileCards}</div><div class="hidden md:block overflow-x-auto"><table class="w-full min-w-[700px] text-left text-sm"><thead><tr class="text-zinc-400"><th class="p-2">${t('people.columns.name')}</th><th class="p-2">${t('people.columns.trade')}</th><th class="p-2">${t('people.columns.level')}</th><th class="p-2">${t('people.columns.workingHours')}</th><th class="p-2">${t('common.actions')}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  globalScope.ProjectoryViews = {
    ...(globalScope.ProjectoryViews || {}),
    renderPeopleView
  };
})(window);
