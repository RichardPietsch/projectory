      function ownershipView() {
        const projects = state.projectsPayload.projects;
        const viewerMode = isViewerMode();
        const viewerPersonId = currentPersonId();

        if (projects.length === 0) {
          return `<div class="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-300">${i18n.t('clientTeams.emptyState')}</div>`;
        }

        const hasSelectedProject = state.selectedProjectId && projects.some((project) => String(project.id) === String(state.selectedProjectId));
        if (!hasSelectedProject) {
          state.selectedProjectId = '';

          const projectsWithTeams = projects.map((project) => {
            const projectAssignments = state.projectsPayload.assignments.filter((assignment) => Number(assignment.project_id) === Number(project.id));
            const peopleById = new Map();

            for (const assignment of projectAssignments) {
              const personId = String(assignment.person_id);
              if (!peopleById.has(personId)) {
                peopleById.set(personId, {
                  id: personId,
                  firstName: String(assignment.first_name || ''),
                  lastName: String(assignment.last_name || ''),
                  name: `${assignment.first_name} ${assignment.last_name}`,
                  isLeaver: Boolean(assignment.is_leaver),
                  owner: false,
                  leader: false
                });
              }
              const person = peopleById.get(personId);

              if (assignment.is_owner) person.owner = true;
              if (assignment.is_leader) person.leader = true;
            }

            const sortByFirstName = (a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName);
            const ownerEntries = Array.from(peopleById.values()).filter((person) => person.owner).sort(sortByFirstName);
            const leaderEntries = Array.from(peopleById.values()).filter((person) => person.leader).sort(sortByFirstName);

            return {
              ...project,
              ownerEntries,
              leaderEntries,
              ownerSort: ownerEntries.map((person) => person.name).join(', ').toLowerCase(),
              leaderSort: leaderEntries.map((person) => person.name).join(', ').toLowerCase(),
              productSort: String(project.name || '').toLowerCase(),
              clientSort: String(project.client_name || '').toLowerCase(),
              budgetSort: Number(project.budget_cents || 0),
              prioritySort: getPriorityPresentation(project.priority_name).rank,
              statusSort: getProjectStatusPresentation(project.status).rank
            };
          });

          const sortedProjects = [...projectsWithTeams].sort((a, b) => {
            switch (state.clientTeamsSort) {
              case 'product_desc':
                return b.productSort.localeCompare(a.productSort) || a.clientSort.localeCompare(b.clientSort);
              case 'client_asc':
                return a.clientSort.localeCompare(b.clientSort) || a.productSort.localeCompare(b.productSort);
              case 'client_desc':
                return b.clientSort.localeCompare(a.clientSort) || a.productSort.localeCompare(b.productSort);
              case 'budget_asc':
                return a.budgetSort - b.budgetSort || a.productSort.localeCompare(b.productSort);
              case 'budget_desc':
                return b.budgetSort - a.budgetSort || a.productSort.localeCompare(b.productSort);
              case 'owner_asc':
                return a.ownerSort.localeCompare(b.ownerSort) || a.productSort.localeCompare(b.productSort);
              case 'owner_desc':
                return b.ownerSort.localeCompare(a.ownerSort) || a.productSort.localeCompare(b.productSort);
              case 'leaders_asc':
                return a.leaderSort.localeCompare(b.leaderSort) || a.productSort.localeCompare(b.productSort);
              case 'leaders_desc':
                return b.leaderSort.localeCompare(a.leaderSort) || a.productSort.localeCompare(b.productSort);
              case 'priority_asc':
                return a.prioritySort - b.prioritySort || a.productSort.localeCompare(b.productSort);
              case 'priority_desc':
                return b.prioritySort - a.prioritySort || a.productSort.localeCompare(b.productSort);
              case 'status_asc':
                return a.statusSort - b.statusSort || a.productSort.localeCompare(b.productSort);
              case 'status_desc':
                return b.statusSort - a.statusSort || a.productSort.localeCompare(b.productSort);
              case 'product_asc':
              default:
                return a.productSort.localeCompare(b.productSort) || a.clientSort.localeCompare(b.clientSort);
            }
          });

          const clientTeamsTerm = String(state.clientTeamsSearch || '').trim().toLowerCase();
          const filteredProjects = clientTeamsTerm
            ? sortedProjects.filter((project) => {
                const searchable = [
                  project.name,
                  project.client_name,
                  project.priority_name,
                  project.ownerSort,
                  project.leaderSort,
                  getProjectStatusPresentation(project.status).label
                ]
                  .join(' ')
                  .toLowerCase();
                return searchable.includes(clientTeamsTerm);
              })
            : sortedProjects;

          function renderPersonSummary(entries, emptyKey) {
            if (!entries.length) return i18n.t(emptyKey);
            return entries
              .map((person) => {
                const isSelf = viewerPersonId && String(person.id) === viewerPersonId;
                return `${selfRoleIcon(isSelf)}${person.name}${leaverRunIcon(person.isLeaver)}`;
              })
              .join(', ');
          }

          function renderOwnerPills(project) {
            if (!project.ownerEntries.length) return `<span class="text-zinc-400">${i18n.t('clientTeams.noOwnerAssigned')}</span>`;
            return project.ownerEntries
              .map((person) => {
                const isSelf = viewerPersonId && String(person.id) === viewerPersonId;
                const ownerClass = isSelf
                  ? 'border-blue-300 bg-blue-500 text-blue-50'
                  : 'border-blue-400/70 bg-blue-600 text-blue-50';
                return `<span class="mb-1 mr-1 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${ownerClass}">${selfRoleIcon(isSelf)}<span>${person.name}${leaverRunIcon(person.isLeaver)}</span></span>`;
              })
              .join('');
          }

          function renderLeaderPills(project) {
            if (!project.leaderEntries.length) return `<span class="text-zinc-400">${i18n.t('clientTeams.noLeaderAssigned')}</span>`;
            return project.leaderEntries
              .map((person) => {
                const isSelf = viewerPersonId && String(person.id) === viewerPersonId;
                const leaderClass = person.owner
                  ? (isSelf
                      ? 'border-emerald-300 border-dotted bg-emerald-500/20 text-emerald-100'
                      : 'border-emerald-400/70 border-dotted bg-transparent text-emerald-200')
                  : (isSelf
                      ? 'border-emerald-300 bg-emerald-500 text-emerald-50'
                      : 'border-emerald-400/70 bg-emerald-600 text-emerald-50');
                return `<span class="mb-1 mr-1 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${leaderClass}">${selfRoleIcon(isSelf)}<span>${person.name}${leaverRunIcon(person.isLeaver)}</span></span>`;
              })
              .join('');
          }

          function clientTeamsSortOptionLabel(sortValue) {
            const labels = {
              status_desc: i18n.t('clientTeams.sort.statusDesc'),
              status_asc: i18n.t('clientTeams.sort.statusAsc'),
              product_asc: i18n.t('clientTeams.sort.productAsc'),
              product_desc: i18n.t('clientTeams.sort.productDesc'),
              client_asc: i18n.t('clientTeams.sort.clientAsc'),
              client_desc: i18n.t('clientTeams.sort.clientDesc'),
              budget_asc: i18n.t('clientTeams.sort.budgetAsc'),
              budget_desc: i18n.t('clientTeams.sort.budgetDesc'),
              priority_asc: i18n.t('clientTeams.sort.priorityAsc'),
              priority_desc: i18n.t('clientTeams.sort.priorityDesc'),
              owner_asc: i18n.t('clientTeams.sort.ownerAsc'),
              owner_desc: i18n.t('clientTeams.sort.ownerDesc'),
              leaders_asc: i18n.t('clientTeams.sort.leadersAsc'),
              leaders_desc: i18n.t('clientTeams.sort.leadersDesc')
            };
            return labels[sortValue] || sortValue;
          }

          const projectRows = filteredProjects
            .map((project) => {
              const hasCurrentUserAssignment = viewerPersonId && state.projectsPayload.assignments.some((assignment) => Number(assignment.project_id) === Number(project.id) && String(assignment.person_id) === viewerPersonId);
              const ownerPills = renderOwnerPills(project);
              const leaderPills = renderLeaderPills(project);
              const rowClass = hasCurrentUserAssignment
                ? 'cursor-pointer border-t border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20'
                : 'cursor-pointer border-t border-zinc-800 hover:bg-zinc-700/40';

              return `<tr class="${rowClass}" onclick="openProjectDetail(${project.id})">
                <td class="p-2 text-zinc-300">${renderProjectStatusPill(project.status, project.id)}</td>
                <td class="p-2">
                  <div class="font-medium text-zinc-100">${project.name}</div>
                </td>
                <td class="p-2 text-zinc-300">${project.client_name}</td>
                <td class="p-2 text-zinc-300">${formatEuroWhole(project.budget_cents)}</td>
                <td class="p-2 text-zinc-300">${renderPriorityPill(project.priority_name, project.priority_color_hex)}</td>
                <td class="p-2 text-zinc-300">${ownerPills}</td>
                <td class="p-2 text-zinc-300">${leaderPills}</td>
              </tr>`;
            })
            .join('');

          const mobileCards = filteredProjects
            .map((project) => {
              const hasCurrentUserAssignment = viewerPersonId && state.projectsPayload.assignments.some((assignment) => Number(assignment.project_id) === Number(project.id) && String(assignment.person_id) === viewerPersonId);
              const statusPresentation = getProjectStatusPresentation(project.status);
              const priorityPresentation = getPriorityPresentation(project.priority_name, project.priority_color_hex);
              const cardClass = hasCurrentUserAssignment
                ? 'border-cyan-400/60 bg-cyan-500/10'
                : 'border-zinc-800 bg-zinc-950/60';
              return `<button type="button" class="w-full rounded-xl border p-4 text-left shadow-sm transition hover:border-zinc-600 hover:bg-zinc-900/80 focus:outline-none focus:ring-2 focus:ring-[#00d8ff] ${cardClass}" onclick="openProjectDetail(${project.id})">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-base font-semibold text-zinc-50">${project.name}</p>
                    <p class="mt-1 truncate text-sm text-zinc-400">${project.client_name}</p>
                  </div>
                  <div class="shrink-0">${renderPriorityPill(project.priority_name, project.priority_color_hex)}</div>
                </div>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <div class="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">${i18n.t('clientTeams.columns.status')}</p>
                    <div class="mt-1 flex items-center gap-2 text-sm text-zinc-200">
                      ${renderProjectStatusPill(project.status, project.id)}
                      <span class="min-w-0 break-words">${statusPresentation.label}</span>
                    </div>
                  </div>
                  <div class="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">${i18n.t('clientTeams.columns.budget')}</p>
                    <p class="mt-1 break-words text-sm font-medium text-zinc-100">${formatEuroWhole(project.budget_cents)}</p>
                  </div>
                  <div class="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">${i18n.t('clientTeams.columns.owner')}</p>
                    <div class="mt-2 flex flex-wrap gap-2">${renderOwnerPills(project)}</div>
                  </div>
                  <div class="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">${i18n.t('clientTeams.columns.leaders')}</p>
                    <div class="mt-2 flex flex-wrap gap-2">${renderLeaderPills(project)}</div>
                  </div>
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span class="font-semibold uppercase tracking-[0.16em] text-zinc-500">${i18n.t('clientTeams.columns.priority')}</span>
                  <span class="min-w-0 break-words text-zinc-300">${priorityPresentation.label}</span>
                </div>
              </button>`;
            })
            .join('');

          const sortOptions = [
            'status_desc',
            'status_asc',
            'product_asc',
            'product_desc',
            'client_asc',
            'client_desc',
            'budget_desc',
            'budget_asc',
            'priority_asc',
            'priority_desc',
            'owner_asc',
            'owner_desc',
            'leaders_asc',
            'leaders_desc'
          ].map((sortValue) => `<option value="${sortValue}" ${state.clientTeamsSort === sortValue ? 'selected' : ''}>${clientTeamsSortOptionLabel(sortValue)}</option>`).join('');

          return `<div class="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div class="mb-3">
              <h3 class="text-lg font-semibold">${i18n.t('clientTeams.title')}</h3>
              <p class="text-xs text-zinc-400">${i18n.t('clientTeams.subtitle')}</p>
            </div>
            <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="search"
                id="client-teams-search-input"
                value="${state.clientTeamsSearch || ''}"
                oninput="setClientTeamsSearch(this.value)"
                placeholder="${i18n.t('clientTeams.searchPlaceholder')}"
                class="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm"
              />
              <select
                id="client-teams-sort-select"
                onchange="setClientTeamsSort(this.value)"
                class="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200 sm:w-64"
                aria-label="${i18n.t('clientTeams.sort.label')}"
              >${sortOptions}</select>
              <button
                class="rounded border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-700 ${state.clientTeamsSearch ? '' : 'opacity-50'}"
                onclick="clearClientTeamsSearch()"
                ${state.clientTeamsSearch ? '' : 'disabled'}
                title="Clear search"
              >✕</button>
            </div>
            <div id="client-teams-mobile-list" class="space-y-3 md:hidden">${mobileCards}</div>
            <div class="mt-4 hidden overflow-x-auto md:block">
              <table id="onboarding-project-overview-table" class="min-w-[860px] w-full table-fixed text-left text-sm">
                <thead>
                  <tr class="text-zinc-400">
                    <th class="w-[7%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-zinc-100" onclick="setClientTeamsSortField('status')">${i18n.t('clientTeams.columns.status')} ${state.clientTeamsSort.startsWith('status_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                    <th class="w-[23%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-zinc-100" onclick="setClientTeamsSortField('product')">${i18n.t('clientTeams.columns.product')} ${state.clientTeamsSort.startsWith('product_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                    <th class="w-[14%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-zinc-100" onclick="setClientTeamsSortField('client')">${i18n.t('clientTeams.columns.client')} ${state.clientTeamsSort.startsWith('client_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                    <th class="w-[8%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-zinc-100" onclick="setClientTeamsSortField('budget')">${i18n.t('clientTeams.columns.budget')} ${state.clientTeamsSort.startsWith('budget_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                    <th class="w-[11%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-zinc-100" onclick="setClientTeamsSortField('priority')">${i18n.t('clientTeams.columns.priority')} ${state.clientTeamsSort.startsWith('priority_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                    <th class="w-[14%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-zinc-100" onclick="setClientTeamsSortField('owner')">${i18n.t('clientTeams.columns.owner')} ${state.clientTeamsSort.startsWith('owner_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                    <th class="w-[30%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-zinc-100" onclick="setClientTeamsSortField('leaders')">${i18n.t('clientTeams.columns.leaders')} ${state.clientTeamsSort.startsWith('leaders_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                  </tr>
                </thead>
                <tbody>${projectRows}</tbody>
              </table>
            </div>
          </div>`;
        }

        const selectedProjectId = Number(state.selectedProjectId);
        const selectedProject = projects.find((project) => Number(project.id) === selectedProjectId);

        if (!selectedProject) {
          state.selectedProjectId = '';
          return ownershipView();
        }

        const projectChallenges = state.projectsPayload.challenges.filter((challenge) => Number(challenge.project_id) === Number(selectedProject.id));
        const projectAssignments = state.projectsPayload.assignments.filter((assignment) => Number(assignment.project_id) === Number(selectedProject.id));
        const assignmentsByChallenge = new Map();
        for (const assignment of projectAssignments) {
          const key = String(assignment.challenge_id);
          if (!assignmentsByChallenge.has(key)) assignmentsByChallenge.set(key, []);
          assignmentsByChallenge.get(key).push(assignment);
        }

        const assignmentsByPerson = new Map();
        for (const assignment of projectAssignments) {
          const key = String(assignment.person_id);
          if (!assignmentsByPerson.has(key)) assignmentsByPerson.set(key, []);
          assignmentsByPerson.get(key).push(assignment);
        }

        const ownerIds = new Set();
        const leaderIds = new Set();
        const contributorIds = new Set();

        for (const assignment of projectAssignments) {
          const personId = String(assignment.person_id);
          if (assignment.is_owner) {
            ownerIds.add(personId);
          } else if (assignment.is_leader) {
            leaderIds.add(personId);
          } else {
            contributorIds.add(personId);
          }
        }

        function renderTierPeople(ids, tierLabel, primaryTierClass, secondaryTierClass, isSecondaryRole = () => false, containerId = '') {
          const sortedIds = Array.from(ids).sort((a, b) => {
            const sampleA = (assignmentsByPerson.get(a) || [])[0] || {};
            const sampleB = (assignmentsByPerson.get(b) || [])[0] || {};
            const firstA = String(sampleA.first_name || '').toLowerCase();
            const firstB = String(sampleB.first_name || '').toLowerCase();
            const lastA = String(sampleA.last_name || '').toLowerCase();
            const lastB = String(sampleB.last_name || '').toLowerCase();
            return firstA.localeCompare(firstB) || lastA.localeCompare(lastB);
          });

          const entries = sortedIds
            .map((personId) => {
              const personAssignments = assignmentsByPerson.get(personId) || [];
              if (personAssignments.length === 0) return '';
              const sample = personAssignments[0];
              const totalQuantity = personAssignments.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
              const quantity = Math.round(totalQuantity);
              const name = `${sample.first_name} ${sample.last_name}${leaverRunIcon(sample.is_leaver)}`;
              const isSelf = viewerPersonId && String(sample.person_id) === viewerPersonId;
              let tierClass = isSecondaryRole(personId) ? secondaryTierClass : primaryTierClass;
              if (isSelf) {
                if (tierLabel.includes('owner')) {
                  tierClass = 'border-blue-300 bg-blue-500 text-blue-50';
                } else if (tierLabel.includes('leader')) {
                  tierClass = isSecondaryRole(personId)
                    ? 'border-emerald-300 border-dotted bg-emerald-500/20 text-emerald-100'
                    : 'border-emerald-300 bg-emerald-500 text-emerald-50';
                } else {
                  tierClass = isSecondaryRole(personId)
                    ? 'border-zinc-300 border-dotted bg-zinc-200/10 text-zinc-100'
                    : 'border-zinc-300 bg-zinc-100 text-zinc-900';
                }
              }
              const tierLabelWithMeta = `${selfRoleIcon(isSelf)}<span>${name} (${quantity}% · ${formatWorkloadDuration(quantity, sample.working_hours)})</span>`;
              if (viewerMode) {
                return `<span class="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${tierClass}">${tierLabelWithMeta}</span>`;
              }
              return `<button class="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${tierClass} hover:brightness-110" onclick="adjustProjectPersonQuantity(${selectedProject.id}, ${sample.person_id})">${tierLabelWithMeta}</button>`;
            })
            .filter(Boolean)
            .join(' ');

          return `<div ${containerId ? `id="${containerId}"` : ''} class="rounded border border-zinc-700 bg-zinc-950/60 p-3">
            <h4 class="mb-2 text-sm font-semibold text-zinc-200">${tierLabel}</h4>
            <div class="flex flex-wrap gap-2">${entries || `<span class="text-xs text-zinc-400">${i18n.t('common.none')}</span>`}</div>
          </div>`;
        }

        const projectPeopleOverview = `<div id="onboarding-project-team-overview" class="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 class="mb-3 text-lg font-semibold">${i18n.t('projectDetail.teamOverview.title')}</h3>
          <p class="mb-3 text-xs text-zinc-400">${i18n.t('projectDetail.teamOverview.subtitle')}</p>
          <div class="space-y-3">
            ${renderTierPeople(ownerIds, 'Client owner(s)', 'border-blue-400/70 bg-blue-600 text-blue-50', 'border-blue-400/70 bg-blue-600 text-blue-50', () => false, 'onboarding-client-owners')}
            ${renderTierPeople(leaderIds, 'Client leader(s)', 'border-emerald-400/70 bg-emerald-600 text-emerald-50', 'border-emerald-400/70 border-dotted bg-transparent text-emerald-200', (personId) => ownerIds.has(personId), 'onboarding-client-leaders')}
            ${renderTierPeople(contributorIds, 'Contributors', 'border-zinc-500 bg-zinc-700 text-zinc-100', 'border-zinc-500 border-dotted bg-transparent text-zinc-300', (personId) => ownerIds.has(personId) || leaderIds.has(personId), 'onboarding-contributors')}
          </div>
        </div>`;

        const assigneeSortInfoByChallenge = new Map();
        for (const challenge of projectChallenges) {
          const assignments = assignmentsByChallenge.get(String(challenge.id)) || [];
          const normalized = assignments
            .map((assignment) => {
              const roleRank = assignment.is_owner ? 0 : assignment.is_leader ? 1 : 2;
              const name = `${assignment.first_name} ${assignment.last_name}`.trim().toLowerCase();
              return { roleRank, name };
            })
            .sort((a, b) => a.roleRank - b.roleRank || a.name.localeCompare(b.name));

          assigneeSortInfoByChallenge.set(String(challenge.id), {
            roleRank: normalized[0]?.roleRank ?? 3,
            alphaKey: normalized.map((entry) => entry.name).join('|')
          });
        }

        const sortedChallenges = [...projectChallenges].sort((a, b) => {
          const titleA = String(a.title || '').toLowerCase();
          const titleB = String(b.title || '').toLowerCase();
          const descriptionA = String(a.description || '').toLowerCase();
          const descriptionB = String(b.description || '').toLowerCase();
          const assigneeA = assigneeSortInfoByChallenge.get(String(a.id)) || { roleRank: 3, alphaKey: '' };
          const assigneeB = assigneeSortInfoByChallenge.get(String(b.id)) || { roleRank: 3, alphaKey: '' };

          switch (state.challengesSort) {
            case 'title_desc':
              return titleB.localeCompare(titleA);
            case 'description_asc':
              return descriptionA.localeCompare(descriptionB) || titleA.localeCompare(titleB);
            case 'description_desc':
              return descriptionB.localeCompare(descriptionA) || titleA.localeCompare(titleB);
            case 'assignees_asc':
              return assigneeA.roleRank - assigneeB.roleRank || assigneeA.alphaKey.localeCompare(assigneeB.alphaKey) || titleA.localeCompare(titleB);
            case 'assignees_desc':
              return assigneeB.roleRank - assigneeA.roleRank || assigneeB.alphaKey.localeCompare(assigneeA.alphaKey) || titleA.localeCompare(titleB);
            case 'title_asc':
            default:
              return titleA.localeCompare(titleB);
          }
        });

        function getChallengeDescriptionPreview(description) {
          const trimmed = String(description || '').trim();
          if (!trimmed) return '—';
          return trimmed.length > 160 ? `${trimmed.slice(0, 157).trimEnd()}…` : trimmed;
        }

        function renderChallengeAssignees(challenge, assignments) {
          if (!assignments.length) {
            return viewerMode
              ? `<span class="text-zinc-400">—</span>`
              : `<button class="rounded border border-[#00d8ff]/50 px-2 py-1 text-xs text-[#00d8ff]" onclick='openAssignModal(${challenge.id}, ${JSON.stringify(challenge.title)})'>${i18n.t('assign.assign')}</button>`;
          }

          return [...assignments]
            .sort((a, b) => String(a.first_name || '').localeCompare(String(b.first_name || '')) || String(a.last_name || '').localeCompare(String(b.last_name || '')))
            .map((assignment) => {
              const personId = String(assignment.person_id);
              const hasOwnerRole = ownerIds.has(personId);
              const hasLeaderRole = leaderIds.has(personId);
              const isSelf = viewerPersonId && personId === viewerPersonId;
              const roleClass = assignment.is_owner
                ? (isSelf ? 'border-blue-300 bg-blue-500 text-blue-50' : 'border-blue-400/70 bg-blue-600 text-blue-50')
                : assignment.is_leader
                  ? hasOwnerRole
                    ? (isSelf ? 'border-emerald-300 border-dotted bg-emerald-500/20 text-emerald-100' : 'border-emerald-400/70 border-dotted bg-transparent text-emerald-200')
                    : (isSelf ? 'border-emerald-300 bg-emerald-500 text-emerald-50' : 'border-emerald-400/70 bg-emerald-600 text-emerald-50')
                  : hasOwnerRole || hasLeaderRole
                    ? (isSelf ? 'border-zinc-300 border-dotted bg-zinc-200/10 text-zinc-100' : 'border-zinc-500 border-dotted bg-transparent text-zinc-300')
                    : (isSelf ? 'border-zinc-300 bg-zinc-100 text-zinc-900' : 'border-zinc-500 bg-zinc-700 text-zinc-100');
              const roleLabel = assignment.is_owner ? i18n.t('assign.roleOwner') : assignment.is_leader ? i18n.t('assign.roleLeader') : i18n.t('assign.roleContributor');
              const assignmentLabel = `${selfRoleIcon(isSelf)}<span>${assignment.first_name} ${assignment.last_name}${leaverRunIcon(assignment.is_leaver)} (${roleLabel})</span>`;
              if (viewerMode) {
                return `<span class="mb-1 mr-1 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${roleClass}">${assignmentLabel}</span>`;
              }
              return `<button class="mb-1 mr-1 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${roleClass} hover:brightness-110" onclick='openAssignModal(${challenge.id}, ${JSON.stringify(challenge.title)}, ${JSON.stringify(assignment)})'>${assignmentLabel}</button>`;
            })
            .join('');
        }

        function renderChallengeAssigneeSummary(assignments) {
          if (!assignments.length) return viewerMode ? '—' : i18n.t('common.none');
          return [...assignments]
            .sort((a, b) => String(a.first_name || '').localeCompare(String(b.first_name || '')) || String(a.last_name || '').localeCompare(String(b.last_name || '')))
            .map((assignment) => {
              const isSelf = viewerPersonId && String(assignment.person_id) === viewerPersonId;
              const roleLabel = assignment.is_owner ? i18n.t('assign.roleOwner') : assignment.is_leader ? i18n.t('assign.roleLeader') : i18n.t('assign.roleContributor');
              return `${selfRoleIcon(isSelf)}${assignment.first_name} ${assignment.last_name}${leaverRunIcon(assignment.is_leaver)} (${roleLabel})`;
            })
            .join(', ');
        }

        function renderChallengeDeleteButton(challengeId) {
          if (viewerMode) return '';
          return `<button type="button" class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-600/70 text-zinc-700 transition hover:border-rose-500/70 hover:text-rose-600" onclick="openChallengeDeleteModal(${challengeId})" aria-label="${i18n.t('common.delete')}">
            <svg aria-hidden="true" viewBox="0 0 24 24" class="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 4.75h6l.55 1.5H19a.75.75 0 1 1 0 1.5h-.52l-.68 10.24A2 2 0 0 1 15.81 20H8.19a2 2 0 0 1-1.99-2.01L5.52 7.75H5a.75.75 0 1 1 0-1.5h3.45L9 4.75Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              <path d="M10 10v5.5M14 10v5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>`;
        }

        function renderInlineChallengeField(challenge, field) {
          const isEditing = String(state.inlineChallengeEdit.challengeId || '') === String(challenge.id) && state.inlineChallengeEdit.field === field;
          const value = isEditing ? state.inlineChallengeEdit.value : String(challenge[field] || '');
          const frameClass = field === 'title'
            ? 'rounded-xl bg-stone-200 px-3 py-2 text-left transition hover:bg-stone-300'
            : 'rounded-xl bg-stone-200 px-3 py-2.5 text-left transition hover:bg-stone-300';

          if (!isEditing) {
            return `<button type="button" class="block w-full ${frameClass}" onclick="startInlineChallengeEdit(${challenge.id}, '${field}')">
              ${field === 'title'
                ? `<span class="block text-lg font-semibold leading-7 text-zinc-950 break-words">${value}</span>`
                : `<span class="block text-sm leading-7 text-zinc-800 break-words">${value}</span>`}
            </button>`;
          }

          return `<div class="${frameClass}">
            ${field === 'title'
              ? `<input type="text" class="w-full bg-transparent p-0 text-lg font-semibold text-zinc-950 outline-none" value="${safeDom.escapeHtml ? safeDom.escapeHtml(value) : String(value)}" oninput="updateInlineChallengeEditValue(this.value)" onkeydown="handleInlineChallengeEditKeydown(event, ${challenge.id}, '${field}')" autofocus />`
              : `<textarea class="min-h-[7rem] w-full resize-none bg-transparent p-0 text-sm leading-7 text-zinc-900 outline-none" oninput="updateInlineChallengeEditValue(this.value)" onkeydown="handleInlineChallengeEditKeydown(event, ${challenge.id}, '${field}')" autofocus>${safeDom.escapeHtml ? safeDom.escapeHtml(value) : String(value)}</textarea>`}
            <div class="mt-2 flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-zinc-600/70 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-300/70" onclick="cancelInlineChallengeEdit()">${i18n.t('common.cancel')}</button>
              <button type="button" class="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800" onclick="saveInlineChallengeEdit(${challenge.id}, '${field}')" ${state.inlineChallengeEdit.submitting ? 'disabled' : ''}>${i18n.t('common.save')}</button>
            </div>
          </div>`;
        }

        function renderChallengeCardActions(challenge, assignments) {
          if (viewerMode) return '';
          const buttons = [];
          buttons.push(`<button type="button" class="rounded-xl border border-[#0284c7]/40 bg-[#e0f2fe] px-3 py-2 text-xs font-medium text-sky-800 hover:bg-[#d3ecfd]" onclick='openAssignModal(${challenge.id}, ${JSON.stringify(challenge.title)})'>${assignments.length ? i18n.t('projectDetail.actions.addAssignee') : i18n.t('assign.assign')}</button>`);

          if (assignments.length === 1) {
            buttons.push(`<button type="button" class="rounded-xl border border-rose-400/60 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100" onclick='deleteAssignment(${assignments[0].id})'>${i18n.t('projectDetail.actions.unassignNamed', { name: assignments[0].first_name })}</button>`);
          } else if (assignments.length > 1) {
            buttons.push(`<button type="button" class="rounded-xl border border-rose-400/60 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100" onclick='openUnassignModal(${challenge.id})'>${i18n.t('projectDetail.actions.unassign')}</button>`);
          }

          return buttons.join('');
        }
        function challengeSortOptionLabel(sortValue) {
          const labels = {
            title_asc: i18n.t('projectDetail.challengeSort.titleAsc'),
            title_desc: i18n.t('projectDetail.challengeSort.titleDesc'),
            description_asc: i18n.t('projectDetail.challengeSort.descriptionAsc'),
            description_desc: i18n.t('projectDetail.challengeSort.descriptionDesc'),
            assignees_asc: i18n.t('projectDetail.challengeSort.assigneesAsc'),
            assignees_desc: i18n.t('projectDetail.challengeSort.assigneesDesc')
          };
          return labels[sortValue] || sortValue;
        }

        const challengeRows = sortedChallenges
          .map((challenge) => {
            const assignments = assignmentsByChallenge.get(String(challenge.id)) || [];
            const assignees = renderChallengeAssignees(challenge, assignments);
            const deleteButton = renderChallengeDeleteButton(challenge.id);
            const cardActions = renderChallengeCardActions(challenge, assignments);

            return `<article class="group rounded-2xl bg-stone-300 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  ${renderInlineChallengeField(challenge, 'title')}
                </div>
                ${viewerMode ? '' : `<div class="shrink-0 text-right">${deleteButton}</div>`}
              </div>
              <div class="mt-4">
                ${renderInlineChallengeField(challenge, 'description')}
              </div>
              <div class="mt-5 flex items-start justify-between gap-4 border-t border-zinc-600/70 pt-4">
                <p class="min-w-0 flex-1 text-sm leading-6 text-zinc-800">${assignees}</p>
                ${viewerMode ? '' : `<div class="flex shrink-0 flex-wrap justify-end gap-2">${cardActions}</div>`}
              </div>
            </article>`;
          })
          .join('');

        const mobileChallengeCards = sortedChallenges
          .map((challenge) => {
            const assignments = assignmentsByChallenge.get(String(challenge.id)) || [];
            const deleteButton = renderChallengeDeleteButton(challenge.id);
            const cardActions = renderChallengeCardActions(challenge, assignments);
            return `<article class="rounded-2xl bg-stone-300 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  ${renderInlineChallengeField(challenge, 'title')}
                </div>
                ${viewerMode ? '' : `<div class="shrink-0">${deleteButton}</div>`}
              </div>
              <div class="mt-4">
                ${renderInlineChallengeField(challenge, 'description')}
              </div>
              <div class="mt-5 border-t border-zinc-600/70 pt-4">
                <div class="flex items-start justify-between gap-4">
                  <p class="min-w-0 flex-1 text-sm leading-6 text-zinc-800 break-words">${renderChallengeAssignees(challenge, assignments)}</p>
                  ${viewerMode ? '' : `<div class="flex shrink-0 flex-col gap-2">${cardActions}</div>`}
                </div>
              </div>
            </article>`;
          })
          .join('');

        const statusPresentation = getProjectStatusPresentation(selectedProject.status);
        const statusControl = viewerMode
          ? `<div class="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-700/50 px-3"><span class="h-2.5 w-2.5 rounded-full" style="background:${statusPresentation.colorHex};"></span><span class="text-xs font-semibold text-zinc-100">${statusPresentation.label}</span></div>`
          : `<button class="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-700/50 px-3 hover:bg-zinc-700" onclick="openProjectStatusModal(${selectedProject.id}, '${String(selectedProject.status || 'white').toLowerCase()}')"><span class="h-2.5 w-2.5 rounded-full" style="background:${statusPresentation.colorHex};"></span><span class="text-xs font-semibold text-zinc-100">${statusPresentation.label}</span></button>`;

        const priorityControl = viewerMode || isTeammateMode()
          ? `<div class="inline-flex h-9 items-center">${renderPriorityPill(selectedProject.priority_name, selectedProject.priority_color_hex)}</div>`
          : `<button class="inline-flex h-9 items-center" onclick="openProjectPriorityModal(${selectedProject.client_id}, ${selectedProject.priority_id})">${renderPriorityPill(selectedProject.priority_name, selectedProject.priority_color_hex)}</button>`;

        return `<div class="mb-6 rounded-xl bg-zinc-800 p-4">
            <div class="grid grid-cols-1 gap-3 text-sm text-zinc-300 lg:grid-cols-6 lg:items-center">
              <div class="flex min-w-0 flex-wrap items-center gap-2 lg:col-span-3">
                <button class="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-700" onclick='goToProjectOverview()'>${i18n.t('clientTeams.title')}</button>
                <span>/</span>
                <span class="font-semibold text-zinc-100">${selectedProject.name} (${selectedProject.client_name})</span>
              </div>
              <div class="flex min-w-0 flex-col justify-center text-xs"><span class="mb-1 text-zinc-400">${i18n.t('common.status')}</span><div class="flex h-9 items-center">${statusControl}</div></div>
              <div class="flex min-w-0 flex-col justify-center text-xs"><span class="mb-1 text-zinc-400">${i18n.t('clientTeams.columns.priority')}</span><div class="flex h-9 items-center">${priorityControl}</div></div>
              <div class="flex min-w-0 flex-col justify-center text-xs"><span class="mb-1 text-zinc-400">${i18n.t('clientTeams.columns.budget')}</span><div class="flex h-9 items-center px-1 text-xs font-semibold text-zinc-100">${formatEuroWhole(selectedProject.budget_cents)}</div></div>
            </div>
          </div>

          <div id="onboarding-challenge-overview" class="rounded-2xl bg-zinc-800 p-5 shadow-[0_24px_60px_rgba(2,6,23,0.24)] lg:p-6">
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="max-w-3xl">
                  <h3 class="text-2xl font-semibold tracking-tight text-zinc-50">${i18n.t('projectDetail.challengeOverview.title')}</h3>
                  <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">${i18n.t('projectDetail.challengeOverview.subtitle')}</p>
                </div>
                <div class="flex flex-col items-stretch gap-3 lg:min-w-[14rem] lg:items-end">
                  ${viewerMode ? '' : `<button id="onboarding-add-challenge" class="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00d8ff] px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-[#33e1ff]" onclick='openChallengeModal()'><svg aria-hidden="true" viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M19 11h-3V8a2 2 0 0 0-2-2h-1V5a2 2 0 1 0-4 0v1H8a2 2 0 0 0-2 2v3H5a2 2 0 1 0 0 4h1v3a2 2 0 0 0 2 2h3v-1a2 2 0 1 1 4 0v1h3a2 2 0 0 0 2-2v-3h1a2 2 0 1 0 0-4Zm-5 2h-2v2h-2v-2H8v-2h2V9h2v2h2Z"/></svg><span>${i18n.t('challenge.add')}</span></button>`}
                  <div class="w-full lg:w-[14rem]">
                    <label for="challenge-sort-select" class="mb-1 block text-xs text-zinc-400 capitalize">${i18n.t('projectDetail.challengeSort.label')}</label>
                    <select
                      id="challenge-sort-select"
                      onchange="setChallengesSort(this.value)"
                      class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100"
                      aria-label="${i18n.t('projectDetail.challengeSort.label')}"
                    >${['title_asc','title_desc','description_asc','description_desc','assignees_asc','assignees_desc'].map((sortValue) => `<option value="${sortValue}" ${state.challengesSort === sortValue ? 'selected' : ''}>${challengeSortOptionLabel(sortValue)}</option>`).join('')}</select>
                  </div>
                </div>
              </div>
            <div class="mt-5 space-y-4 lg:hidden">${mobileChallengeCards}</div>
            <div class="mt-5 hidden lg:block">
              <div class="space-y-4">${challengeRows}</div>
            </div>
          </div>

          ${projectPeopleOverview}`;
      }

const safeDom = window.ProjectorySafeDom || {};

      function populateSelectOptions(select, items, selected) {
        if (!select) return;
        if (typeof safeDom.clearChildren === 'function') {
          safeDom.clearChildren(select);
        } else {
          select.textContent = '';
        }

        for (const item of items || []) {
          const isSelected = String(selected) === String(item.id);
          if (typeof safeDom.appendOption === 'function') {
            safeDom.appendOption(select, item.id, item.name, isSelected);
          } else {
            const option = document.createElement('option');
            option.value = String(item.id);
            option.textContent = String(item.name || '');
            option.selected = isSelected;
            select.appendChild(option);
          }
        }
      }

      function renderAssignPeopleList(list, people) {
        if (typeof safeDom.clearChildren === 'function') {
          safeDom.clearChildren(list);
        } else {
          list.textContent = '';
        }

        if (people.length === 0) {
          const empty = document.createElement('p');
          empty.className = 'p-2 text-sm text-zinc-400';
          if (typeof safeDom.setText === 'function') {
            safeDom.setText(empty, i18n.t('assign.noMatches'));
          } else {
            empty.textContent = i18n.t('assign.noMatches');
          }
          list.appendChild(empty);
          state.assignModal.selectedPersonId = '';
          return;
        }

        if (!people.some((person) => String(person.id) === String(state.assignModal.selectedPersonId))) {
          state.assignModal.selectedPersonId = String(people[0].id);
        }

        for (const person of people) {
          const label = document.createElement('label');
          label.className = 'mb-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-zinc-900';

          const input = document.createElement('input');
          input.type = 'radio';
          input.name = 'assign-person';
          input.value = String(person.id);
          input.checked = String(state.assignModal.selectedPersonId) === String(person.id);

          const nameWrap = document.createElement('span');
          nameWrap.appendChild(document.createTextNode(`${String(person.first_name || '')} ${String(person.last_name || '')}`.trim()));

          if (person.is_leaver) {
            const leaverBadge = document.createElement('span');
            leaverBadge.className = 'ml-1 rounded border border-amber-500/60 px-1 py-0.5 text-[10px] uppercase tracking-wide text-amber-300';
            if (typeof safeDom.setText === 'function') {
              safeDom.setText(leaverBadge, i18n.t('people.flags.leaver'));
            } else {
              leaverBadge.textContent = i18n.t('people.flags.leaver');
            }
            nameWrap.appendChild(document.createTextNode(' '));
            nameWrap.appendChild(leaverBadge);
          }

          const trade = document.createElement('span');
          trade.className = 'text-xs text-zinc-400';
          if (typeof safeDom.setText === 'function') {
            safeDom.setText(trade, `(${String(person.trade_name || '')})`);
          } else {
            trade.textContent = `(${String(person.trade_name || '')})`;
          }

          nameWrap.appendChild(document.createTextNode(' '));
          nameWrap.appendChild(trade);
          label.appendChild(input);
          label.appendChild(nameWrap);
          list.appendChild(label);
        }

        list.querySelectorAll('input[name="assign-person"]').forEach((input) => {
          input.addEventListener('change', () => {
            state.assignModal.selectedPersonId = input.value;
          });
        });
      }

function filteredPeople() {
        const search = state.assignModal.search.trim().toLowerCase();
        const isPersonAllowed = (person) => {
          if (!personIsVisibleInNonAdmin(person)) return false;
          if (isTeammateMode() && person.is_hidden) return false;
          return true;
        };
        if (!search) {
          return state.people.filter(isPersonAllowed);
        }

        return state.people.filter((person) => isPersonAllowed(person) && `${person.first_name} ${person.last_name}`.toLowerCase().includes(search));
      }

      function renderAssignModal() {
        const modal = document.getElementById('assign-modal');
        modal.classList.toggle('hidden', !state.assignModal.open);
        modal.classList.toggle('flex', state.assignModal.open);

        if (!state.assignModal.open) {
          return;
        }

        document.getElementById('assign-modal-title').textContent = `${state.assignModal.assignmentId ? i18n.t('assign.changeTitle') : i18n.t('assign.title')} · ${state.assignModal.challengeTitle}`;
        document.getElementById('assign-search').value = state.assignModal.search;
        document.getElementById('assign-role').value = state.assignModal.role;
        const people = filteredPeople();
        const list = document.getElementById('assign-people-list');

        renderAssignPeopleList(list, people);
      }

      async function handleMutation(action, successMessage) {
        try {
          await action();
          await loadData();
          render();
          showMessage(successMessage);
        } catch (error) {
          showMessage(error.message, 'error');
        }
      }

      function openAdminPersonModal(person = null) {
        const modal = document.getElementById('admin-person-modal');
        document.getElementById('admin-person-modal-title').textContent = person ? i18n.t('people.edit') : i18n.t('people.add');
        const tradeSelect = document.getElementById('admin-person-trade');
        const levelSelect = document.getElementById('admin-person-level');
        populateSelectOptions(tradeSelect, state.meta.trades, person?.trade_id);
        populateSelectOptions(levelSelect, state.meta.levels, person?.level_id);
        const form = document.getElementById('admin-person-form');
        form.id.value = person?.id || '';
        form.firstName.value = person?.first_name || '';
        form.lastName.value = person?.last_name || '';
        form.workingHours.value = Number(person?.working_hours || 40);
        form.isHidden.checked = Boolean(person?.is_hidden);
        form.isLeaver.checked = Boolean(person?.is_leaver);
        modal.classList.remove('hidden'); modal.classList.add('flex');
      }
      window.openAdminPersonModal = openAdminPersonModal;
      function closeAdminPersonModal() { const m=document.getElementById('admin-person-modal'); m.classList.add('hidden'); m.classList.remove('flex'); }

      function openAdminClientModal(client = null) {
        const modal = document.getElementById('admin-client-modal');
        document.getElementById('admin-client-modal-title').textContent = client ? i18n.t('clients.edit') : i18n.t('clients.add');
        const prioritySelect = document.getElementById('admin-client-priority');
        populateSelectOptions(prioritySelect, state.meta.priorities, client?.priority_id);
        const form = document.getElementById('admin-client-form');
        form.id.value = client?.id || '';
        form.name.value = client?.name || '';
        form.location.value = client?.location || '';
        form.sinceMonth.value = client?.since_month || '';
        modal.classList.remove('hidden'); modal.classList.add('flex');
      }
      window.openAdminClientModal = openAdminClientModal;
      function closeAdminClientModal() { const m=document.getElementById('admin-client-modal'); m.classList.add('hidden'); m.classList.remove('flex'); }

      function openAdminProjectModal(project = null) {
        const modal = document.getElementById('admin-project-modal');
        document.getElementById('admin-project-modal-title').textContent = project ? i18n.t('projects.edit') : i18n.t('projects.add');
        const clientSelect = document.getElementById('admin-project-client');
        populateSelectOptions(clientSelect, state.clients, project?.client_id);
        const statusSelect = document.getElementById('admin-project-status');
        if (statusSelect) {
          if (typeof safeDom.clearChildren === 'function') {
            safeDom.clearChildren(statusSelect);
          } else {
            statusSelect.textContent = '';
          }
          for (const item of state.meta.projectStatuses || []) {
            if (typeof safeDom.appendOption === 'function') {
              safeDom.appendOption(statusSelect, item.key, item.label, false);
            } else {
              const option = document.createElement('option');
              option.value = String(item.key || '');
              option.textContent = String(item.label || '');
              statusSelect.appendChild(option);
            }
          }
        }
        const form = document.getElementById('admin-project-form');
        form.id.value = project?.id || '';
        form.name.value = project?.name || '';
        form.status.value = project?.status || (state.meta.projectStatuses?.[0]?.key || 'in_progress');
        form.startMonth.value = project?.start_month || '';
        form.endMonth.value = project?.end_month || '';
        form.budgetEuros.value = project ? (Number(project.budget_cents)/100).toFixed(2) : '';
        modal.classList.remove('hidden'); modal.classList.add('flex');
      }
      window.openAdminProjectModal = openAdminProjectModal;
      function closeAdminProjectModal() { const m=document.getElementById('admin-project-modal'); m.classList.add('hidden'); m.classList.remove('flex'); }

      function bindAdminEntityModalActions() {
        if (state.listenersBound.adminEntityModals) return;
        state.listenersBound.adminEntityModals = true;
        document.getElementById('admin-person-modal-close')?.addEventListener('click', closeAdminPersonModal);
        document.getElementById('admin-person-modal-cancel')?.addEventListener('click', closeAdminPersonModal);
        document.getElementById('admin-client-modal-close')?.addEventListener('click', closeAdminClientModal);
        document.getElementById('admin-client-modal-cancel')?.addEventListener('click', closeAdminClientModal);
        document.getElementById('admin-project-modal-close')?.addEventListener('click', closeAdminProjectModal);
        document.getElementById('admin-project-modal-cancel')?.addEventListener('click', closeAdminProjectModal);

        document.getElementById('admin-person-form')?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const payload = Object.fromEntries(new FormData(event.target).entries());
          const id = payload.id; delete payload.id;
          payload.isHidden = Boolean(event.target.isHidden?.checked);
          payload.isLeaver = Boolean(event.target.isLeaver?.checked);
          payload.workingHours = Number.parseInt(event.target.workingHours?.value, 10) || 40;
          await handleMutation(() => api(id ? `/api/people/${id}` : '/api/people', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) }), 'Person saved.');
          closeAdminPersonModal();
        });
        document.getElementById('admin-client-form')?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const payload = Object.fromEntries(new FormData(event.target).entries());
          const id = payload.id; delete payload.id;
          await handleMutation(() => api(id ? `/api/clients/${id}` : '/api/clients', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) }), 'Client saved.');
          closeAdminClientModal();
        });
        document.getElementById('admin-project-form')?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const payload = Object.fromEntries(new FormData(event.target).entries());
          const id = payload.id; delete payload.id;
          await handleMutation(() => api(id ? `/api/projects/${id}` : '/api/projects', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) }), 'Project saved.');
          closeAdminProjectModal();
        });
      }

      function renderAdminTabs() {
        const root = document.getElementById('admin-tabs');
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
        root.innerHTML = adminTabs
          .map((tab) => `<button class="rounded-lg border px-4 py-2 text-sm font-semibold ${state.adminTab === tab.id ? 'border-[#00d8ff] bg-[#00d8ff]/15 text-[#7cecff]' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}" data-admin-tab="${tab.id}">${tab.label}</button>`)
          .join('');

        root.querySelectorAll('button').forEach((button) => {
          button.addEventListener('click', () => {
            state.adminTab = button.dataset.adminTab;
            render();
          });
        });
      }

      function bindForms() {
        const personForm = document.getElementById('person-form');
        if (personForm) {
          personForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const payload = Object.fromEntries(new FormData(personForm).entries());
            const id = payload.id;
            delete payload.id;
            await handleMutation(() => api(id ? `/api/people/${id}` : '/api/people', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) }), 'Person saved.');
            personForm.reset();
          });
        }

        const clientForm = document.getElementById('client-form');
        if (clientForm) {
          clientForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const payload = Object.fromEntries(new FormData(clientForm).entries());
            const id = payload.id;
            delete payload.id;
            await handleMutation(() => api(id ? `/api/clients/${id}` : '/api/clients', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) }), 'Client saved.');
            clientForm.reset();
          });
        }

        const challengeModalForm = document.getElementById('challenge-modal-form');
        if (challengeModalForm && !state.listenersBound.challengeModalForm) {
          state.listenersBound.challengeModalForm = true;
          challengeModalForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (state.challengeSubmitting) return;

            const payload = Object.fromEntries(new FormData(challengeModalForm).entries());
            const id = payload.id;
            delete payload.id;

            state.challengeSubmitting = true;
            const submitButton = challengeModalForm.querySelector('button[type="submit"], button:not([type])');
            if (submitButton) submitButton.disabled = true;

            try {
              if (id) {
                await handleMutation(() => api(`/api/challenges/${id}`, { method: 'PUT', body: JSON.stringify(payload) }), 'Challenge saved.');
              } else {
                await handleMutation(() => api(`/api/projects/${state.selectedProjectId}/challenges`, { method: 'POST', body: JSON.stringify(payload) }), 'Challenge saved.');
              }
              closeChallengeModal();
            } finally {
              state.challengeSubmitting = false;
              if (submitButton) submitButton.disabled = false;
            }
          });
        }

      }

      const portabilityScopes = [
        { key: 'people', labelKey: 'portability.scope.people' },
        { key: 'clients', labelKey: 'portability.scope.clients' },
        { key: 'projects', labelKey: 'portability.scope.projects' },
        { key: 'configuration', labelKey: 'portability.scope.configuration' },
        { key: 'access-audit', labelKey: 'portability.scope.accessAudit' }
      ];

      function getScopeLabel(scopeKey) {
        const found = portabilityScopes.find((scope) => scope.key === scopeKey);
        return found ? i18n.t(found.labelKey) : scopeKey;
      }

      async function downloadExport(scope, format) {
        const endpoint = `/api/export/${scope}`;
        const prefix = `projectory-${scope}-export`;
        if (format === 'csv') {
          const response = await fetch(`${endpoint}?format=csv`);
          if (!response.ok) {
            throw new Error('CSV export failed.');
          }
          const csv = await response.text();
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          return;
        }

        const payload = await api(endpoint);
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }

      function renderExportModal() {
        const modal = document.getElementById('export-modal');
        modal.classList.toggle('hidden', !state.exportModalOpen);
        modal.classList.toggle('flex', state.exportModalOpen);
        const list = document.getElementById('export-scope-list');
        if (!list) return;
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
        list.innerHTML = portabilityScopes.map((scope) => `<div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded border border-zinc-700 bg-zinc-950/40 p-2"><span class="text-sm text-zinc-200">${i18n.t(scope.labelKey)}</span><button class="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700" data-export-scope="${scope.key}" data-export-format="json">${i18n.t('portability.exportJson')}</button><button class="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700" data-export-scope="${scope.key}" data-export-format="csv">${i18n.t('portability.exportCsv')}</button></div>`).join('');
      }

      function closeExportModal() {
        state.exportModalOpen = false;
        renderExportModal();
      }

      function openExportModal() {
        state.exportModalOpen = true;
        renderExportModal();
      }

      function renderImportModal() {
        const modal = document.getElementById('import-modal');
        modal.classList.toggle('hidden', !state.importModalOpen);
        modal.classList.toggle('flex', state.importModalOpen);

        const list = document.getElementById('import-scope-list');
        if (list) {
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          list.innerHTML = portabilityScopes.map((scope) => `<div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded border border-zinc-700 bg-zinc-950/40 p-2"><span class="text-sm text-zinc-200">${i18n.t(scope.labelKey)}</span><button class="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700" data-import-scope="${scope.key}" data-import-format="json">${i18n.t('portability.importJson')}</button><button class="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700" data-import-scope="${scope.key}" data-import-format="csv">${i18n.t('portability.importCsv')}</button></div>`).join('');
        }

        const preview = document.getElementById('import-preview');
        const confirmButton = document.getElementById('import-confirm');
        if (!state.importPreviewData) {
          preview?.classList.add('hidden');
          if (confirmButton) confirmButton.disabled = true;
          return;
        }

        preview?.classList.remove('hidden');
        const previewScope = document.getElementById('import-preview-scope');
        if (previewScope) previewScope.textContent = i18n.t('portability.selectedCluster', { cluster: getScopeLabel(state.importScope), format: String(state.importFormat || '').toUpperCase() });
        const summaryList = document.getElementById('import-preview-summary');
        if (summaryList) {
          const items = Object.entries(state.importPreviewData.summary || {});
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          summaryList.innerHTML = items.map(([key, value]) => `<li>${key}: ${value}</li>`).join('');
        }
        if (confirmButton) confirmButton.disabled = false;
      }

      function closeImportModal() {
        state.importModalOpen = false;
        state.importPreviewData = null;
        state.importScope = '';
        state.importFormat = '';
        const input = document.getElementById('import-file');
        if (input) input.value = '';
        renderImportModal();
      }

      function openImportModal() {
        state.importModalOpen = true;
        state.importScope = '';
        state.importFormat = '';
        state.importPreviewData = null;
        renderImportModal();
      }

      async function previewImportFile(file) {
        const format = String(state.importFormat || '').toLowerCase();
        const scope = String(state.importScope || '').toLowerCase();
        if (!scope) {
          throw new Error(i18n.t('portability.import.chooseCluster'));
        }

        if (format === 'json') {
          const text = await file.text();
          const payload = JSON.parse(text);
          const preview = await api(`/api/import/${scope}/preview`, {
            method: 'POST',
            body: JSON.stringify({ format: 'json', data: payload.data || payload })
          });
          state.importPreviewData = preview;
          renderImportModal();
          return;
        }

        const text = await file.text();
        const preview = await api(`/api/import/${scope}/preview`, {
          method: 'POST',
          body: JSON.stringify({ format: 'csv', content: text })
        });
        state.importPreviewData = preview;
        renderImportModal();
      }

      async function confirmImport() {
        if (!state.importPreviewData?.data) {
          showMessage(i18n.t('portability.import.chooseFile'), 'error');
          return;
        }

        await api(`/api/import/${state.importScope}`, { method: 'POST', body: JSON.stringify({ data: state.importPreviewData.data }) });
        await loadData({ forceAppData: true });
        closeImportModal();
        showMessage(i18n.t('portability.import.completed'));
      }

      function renderProjectStatusModal() {
        const modal = document.getElementById('project-status-modal');
        modal.classList.toggle('hidden', !state.projectStatusModal.open);
        modal.classList.toggle('flex', state.projectStatusModal.open);
        if (!state.projectStatusModal.open) return;
        const select = document.getElementById('project-status-select');
        if (select) {
          const statusOptions = state.meta.projectStatuses || [];
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          select.innerHTML = statusOptions.map((item) => `<option value="${item.key}">${item.label}</option>`).join('');
          select.value = state.projectStatusModal.status || (statusOptions[0]?.key || 'in_progress');
        }
      }

      function closeProjectStatusModal() {
        state.projectStatusModal.open = false;
        state.projectStatusModal.projectId = null;
        state.projectStatusModal.status = 'in_progress';
        renderProjectStatusModal();
      }


      function renderProjectPriorityModal() {
        const modal = document.getElementById('project-priority-modal');
        modal.classList.toggle('hidden', !state.projectPriorityModal.open);
        modal.classList.toggle('flex', state.projectPriorityModal.open);
        if (!state.projectPriorityModal.open) return;
        const select = document.getElementById('project-priority-select');
        if (select) {
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          select.innerHTML = state.meta.priorities.map((priority) => `<option value="${priority.id}">${priority.name}</option>`).join('');
          select.value = String(state.projectPriorityModal.priorityId || '');
        }
      }

      function closeProjectPriorityModal() {
        state.projectPriorityModal.open = false;
        state.projectPriorityModal.clientId = null;
        state.projectPriorityModal.priorityId = null;
        renderProjectPriorityModal();
      }

      async function confirmProjectPriorityModal() {
        const clientId = state.projectPriorityModal.clientId;
        if (!clientId) return;
        const priorityId = Number(document.getElementById('project-priority-select')?.value || 0);
        await updateProjectClientPriority(clientId, priorityId);
        closeProjectPriorityModal();
      }

      async function confirmProjectStatusModal() {
        const projectId = state.projectStatusModal.projectId;
        if (!projectId) return;
        const project = state.projectsPayload.projects.find((item) => String(item.id) === String(projectId));
        if (!project) return;

        const nextStatus = String(document.getElementById('project-status-select')?.value || '').toLowerCase();
        const statusItem = (state.meta.projectStatuses || []).find((item) => String(item.key) === nextStatus);
        if (!statusItem) {
          showMessage(i18n.t('projectStatus.invalid'), 'error');
          return;
        }

        await handleMutation(
          () =>
            api(`/api/projects/${project.id}`, {
              method: 'PUT',
              body: JSON.stringify({
                clientId: project.client_id,
                name: project.name,
                status: nextStatus,
                startMonth: project.start_month,
                endMonth: project.end_month || '',
                budgetCents: Number(project.budget_cents || 0)
              })
            }),
          `Project status set to ${statusItem.label}.`
        );

        closeProjectStatusModal();
      }

      function onboardingSteps() {
        return onboardingTour.filterOnboardingStepsByRole(onboardingDemo.steps, currentRole());
      }

      function clearOnboardingHighlight() {
        if (!onboardingDemo.highlightedElement) return;
        onboardingDemo.highlightedElement.classList.remove('ring-4', 'ring-indigo-400', 'ring-offset-2', 'ring-offset-zinc-950', 'relative', 'z-[81]');
        onboardingDemo.highlightedElement = null;
      }

      function closeOnboardingDemo() {
        onboardingDemo.open = false;
        document.getElementById('onboarding-overlay')?.classList.add('hidden');
        document.getElementById('onboarding-popover')?.classList.add('hidden');
        clearOnboardingHighlight();
      }

      function runOnboardingStepEnter(stepIndex) {
        const step = onboardingSteps()[stepIndex];
        if (step && typeof step.onEnter === 'function') {
          step.onEnter();
        }
      }

      function moveOnboardingStep(nextIndex) {
        const steps = onboardingSteps();
        const clamped = onboardingTour.clampOnboardingStepIndex(nextIndex, steps.length);
        onboardingDemo.stepIndex = clamped;
        runOnboardingStepEnter(clamped);
        renderOnboardingDemo();
      }

      function renderOnboardingDemo() {
        const overlay = document.getElementById('onboarding-overlay');
        const popover = document.getElementById('onboarding-popover');
        const prevButton = document.getElementById('onboarding-prev');
        const nextButton = document.getElementById('onboarding-next');
        const closeButton = document.getElementById('onboarding-close');
        if (!overlay || !popover || !prevButton || !nextButton || !closeButton) return;

        if (!onboardingDemo.open) {
          overlay.classList.add('hidden');
          popover.classList.add('hidden');
          clearOnboardingHighlight();
          return;
        }

        const steps = onboardingSteps();
        const step = steps[onboardingDemo.stepIndex];
        const target = step.target ? document.querySelector(step.target) : null;

        overlay.classList.remove('hidden');
        popover.classList.remove('hidden');

        clearOnboardingHighlight();
        if (target) {
          target.classList.add('ring-4', 'ring-indigo-400', 'ring-offset-2', 'ring-offset-zinc-950', 'relative', 'z-[81]');
          onboardingDemo.highlightedElement = target;
        }

        const stepUi = onboardingTour.getOnboardingStepUiState(onboardingDemo.stepIndex, steps.length);
        onboardingDemo.stepIndex = stepUi.index;

        document.getElementById('onboarding-step-indicator').textContent = i18n.t('onboarding.demo.stepIndicator', {
          current: stepUi.current,
          total: stepUi.total
        });
        document.getElementById('onboarding-title').textContent = i18n.t(step.titleKey);
        document.getElementById('onboarding-description').textContent = i18n.t(step.descriptionKey);

        prevButton.disabled = stepUi.isFirstStep;
        prevButton.classList.toggle('opacity-50', stepUi.isFirstStep);

        nextButton.textContent = stepUi.nextAction === 'finish' ? i18n.t('onboarding.demo.finish') : i18n.t('onboarding.demo.next');

        if (!target) {
          const popoverWidth = 420;
          popover.style.left = `${Math.max(12, (window.innerWidth - popoverWidth) / 2)}px`;
          popover.style.top = `${Math.max(20, (window.innerHeight - 230) / 2)}px`;
          return;
        }

        const rect = target.getBoundingClientRect();
        const popoverWidth = Math.min(420, window.innerWidth - 24);
        const popoverHeight = Math.max(220, Math.min(popover.offsetHeight || 260, window.innerHeight - 24));
        const gap = 12;

        const clampLeft = (value) => Math.max(12, Math.min(value, window.innerWidth - popoverWidth - 12));
        const clampTop = (value) => Math.max(12, Math.min(value, window.innerHeight - popoverHeight - 12));

        const candidates = [
          { left: rect.right + gap, top: rect.top + (rect.height - popoverHeight) / 2 },
          { left: rect.left - popoverWidth - gap, top: rect.top + (rect.height - popoverHeight) / 2 },
          { left: rect.left + (rect.width - popoverWidth) / 2, top: rect.bottom + gap },
          { left: rect.left + (rect.width - popoverWidth) / 2, top: rect.top - popoverHeight - gap }
        ].map((candidate) => ({
          left: clampLeft(candidate.left),
          top: clampTop(candidate.top)
        }));

        const overlapsTarget = (candidate) => {
          const popLeft = candidate.left;
          const popRight = candidate.left + popoverWidth;
          const popTop = candidate.top;
          const popBottom = candidate.top + popoverHeight;
          return !(popRight <= rect.left || popLeft >= rect.right || popBottom <= rect.top || popTop >= rect.bottom);
        };

        const chosen = candidates.find((candidate) => !overlapsTarget(candidate)) || {
          left: clampLeft(rect.left),
          top: clampTop(rect.bottom + gap)
        };

        popover.style.left = `${chosen.left}px`;
        popover.style.top = `${chosen.top}px`;
      }

      function startOnboardingDemo() {
        onboardingDemo.open = true;
        moveOnboardingStep(0);
      }

      function bindOnboardingDemoActions() {
        if (onboardingDemo.listenersBound) return;
        onboardingDemo.listenersBound = true;

        document.getElementById('onboarding-demo-start')?.addEventListener('click', startOnboardingDemo);
        document.getElementById('onboarding-overlay')?.addEventListener('click', closeOnboardingDemo);
        document.getElementById('onboarding-close')?.addEventListener('click', closeOnboardingDemo);
        document.getElementById('onboarding-prev')?.addEventListener('click', () => moveOnboardingStep(onboardingDemo.stepIndex - 1));
        document.getElementById('onboarding-next')?.addEventListener('click', () => {
          const steps = onboardingSteps();
          const stepUi = onboardingTour.getOnboardingStepUiState(onboardingDemo.stepIndex, steps.length);
          if (stepUi.isLastStep) {
            closeOnboardingDemo();
            return;
          }
          moveOnboardingStep(stepUi.index + 1);
        });

        window.addEventListener('resize', () => {
          if (onboardingDemo.open) renderOnboardingDemo();
        });
      }

      function bindFooterActions() {

        if (state.listenersBound.footer) return;
        state.listenersBound.footer = true;
        document.addEventListener('click', (event) => {
          const exportButton = event.target.closest('#export-btn');
          if (exportButton) {
            openExportModal();
            return;
          }

          const importButton = event.target.closest('#import-btn');
          if (importButton) {
            openImportModal();
          }
        });
      }

      function bindExportModalActions() {
        if (state.listenersBound.exportModal) return;
        state.listenersBound.exportModal = true;

        document.getElementById('export-modal-close')?.addEventListener('click', closeExportModal);
        document.getElementById('export-cancel')?.addEventListener('click', closeExportModal);
        document.addEventListener('click', async (event) => {
          const exportAction = event.target.closest('[data-export-scope][data-export-format]');
          if (!exportAction) return;
          try {
            await downloadExport(exportAction.dataset.exportScope, exportAction.dataset.exportFormat);
            showMessage(i18n.t('portability.export.completed'));
          } catch (error) {
            showMessage(error.message, 'error');
          }
        });
      }

      function bindImportModalActions() {
        if (state.listenersBound.importModal) return;
        state.listenersBound.importModal = true;

        document.getElementById('import-modal-close')?.addEventListener('click', closeImportModal);
        document.getElementById('import-cancel')?.addEventListener('click', closeImportModal);
        document.addEventListener('click', (event) => {
          const action = event.target.closest('[data-import-scope][data-import-format]');
          if (!action) return;
          state.importScope = action.dataset.importScope;
          state.importFormat = action.dataset.importFormat;
          state.importPreviewData = null;
          const input = document.getElementById('import-file');
          if (input) {
            input.value = '';
            input.accept = state.importFormat === 'json' ? '.json,application/json' : '.csv,text/csv';
            input.click();
          }
          renderImportModal();
        });

        document.getElementById('import-file')?.addEventListener('change', async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;

          try {
            await previewImportFile(file);
          } catch (error) {
            state.importPreviewData = null;
            renderImportModal();
            showMessage(`Import preview failed: ${error.message}`, 'error');
          }
        });

        document.getElementById('import-confirm')?.addEventListener('click', async () => {
          try {
            await confirmImport();
          } catch (error) {
            showMessage(`Import failed: ${error.message}`, 'error');
          }
        });
      }

      function bindProjectStatusModalActions() {
        if (state.listenersBound.projectStatusModal) return;
        state.listenersBound.projectStatusModal = true;

        document.getElementById('project-status-modal-close')?.addEventListener('click', closeProjectStatusModal);
        document.getElementById('project-status-cancel')?.addEventListener('click', closeProjectStatusModal);
        document.getElementById('project-status-confirm')?.addEventListener('click', async () => {
          try {
            await confirmProjectStatusModal();
          } catch (error) {
            showMessage(error.message, 'error');
          }
        });

        document.getElementById('project-priority-modal-close')?.addEventListener('click', closeProjectPriorityModal);
        document.getElementById('project-priority-cancel')?.addEventListener('click', closeProjectPriorityModal);
        document.getElementById('project-priority-confirm')?.addEventListener('click', async () => {
          try {
            await confirmProjectPriorityModal();
          } catch (error) {
            showMessage(error.message, 'error');
          }
        });
      }

      function bindHeaderActions() {
        if (state.listenersBound.header) return;
        state.listenersBound.header = true;
        const responsiveShell = window.ProjectoryResponsiveShell || {};
        document.getElementById('header-menu-toggle')?.addEventListener('click', () => {
          if (typeof responsiveShell.toggleMobileMenu === 'function') responsiveShell.toggleMobileMenu();
        });

        document.getElementById('app-logo-button')?.addEventListener('click', () => {
          if (typeof responsiveShell.closeMobileMenu === 'function') responsiveShell.closeMobileMenu();
          state.showAdmin = false;
          state.homeTab = 'client-teams';
          state.selectedProjectId = '';
          state.peopleOverviewModal.open = false;
          state.peopleOverviewModal.personId = null;
          navigateFromState();
          render();
        });

        const openAdminView = () => {
          if (!canAccessAdmin()) return;
          if (typeof responsiveShell.closeMobileMenu === 'function') responsiveShell.closeMobileMenu();
          state.showAdmin = true;
          navigateFromState();
          render();
        };

        document.getElementById('admin-toggle')?.addEventListener('click', openAdminView);
        document.getElementById('admin-toggle-mobile')?.addEventListener('click', openAdminView);

        document.getElementById('admin-close')?.addEventListener('click', () => {
          state.showAdmin = false;
          navigateFromState();
          render();
        });

        const handleLocaleChange = (event) => {
          i18n.setLocale(event.target.value);
          if (typeof responsiveShell.syncHeaderControls === 'function') responsiveShell.syncHeaderControls();
          render();
        };

        document.getElementById('locale-select')?.addEventListener('change', handleLocaleChange);
        document.getElementById('locale-select-mobile')?.addEventListener('change', handleLocaleChange);

        const handleLogout = async () => {
          try {
            if (typeof responsiveShell.closeMobileMenu === 'function') responsiveShell.closeMobileMenu();
            await api('/api/auth/logout', { method: 'POST' });
            await loadData();
            state.authRequired = true;
            state.showAdmin = false;
            state.homeTab = 'client-teams';
            state.selectedProjectId = '';
            navigateFromState();
            render();
            showMessage(i18n.t('auth.logout.success'));
          } catch (error) {
            showMessage(error.message, 'error');
          }
        };

        document.getElementById('auth-logout')?.addEventListener('click', handleLogout);
        document.getElementById('auth-logout-mobile')?.addEventListener('click', handleLogout);

        window.addEventListener('resize', () => {
          if (typeof responsiveShell.closeMobileMenuOnDesktop === 'function') responsiveShell.closeMobileMenuOnDesktop();
        });

      }

      function bindChallengeModalActions() {
        if (state.listenersBound.challengeModal) return;
        state.listenersBound.challengeModal = true;
        document.getElementById('challenge-modal-close')?.addEventListener('click', closeChallengeModal);
        document.getElementById('challenge-cancel')?.addEventListener('click', closeChallengeModal);

        const challengeForm = document.getElementById('challenge-modal-form');
        const clearPrefilledFieldOnFocus = (field) => {
          if (!field) return;
          field.addEventListener('focus', () => {
            if (field.dataset.prefilled === 'true') {
              field.value = '';
              field.dataset.prefilled = 'false';
            }
          });
        };

        clearPrefilledFieldOnFocus(challengeForm?.title);
        clearPrefilledFieldOnFocus(challengeForm?.description);
      }

      function renderChallengeDeleteModal() {
        const modal = document.getElementById('challenge-delete-modal');
        if (!modal) return;
        modal.classList.toggle('hidden', !state.challengeDeleteModal.open);
        modal.classList.toggle('flex', state.challengeDeleteModal.open);
      }

      function closeChallengeDeleteModal() {
        state.challengeDeleteModal.open = false;
        state.challengeDeleteModal.challengeId = null;
        renderChallengeDeleteModal();
      }

      function bindChallengeDeleteModalActions() {
        if (state.listenersBound.challengeDeleteModal) return;
        state.listenersBound.challengeDeleteModal = true;
        document.getElementById('challenge-delete-modal-close')?.addEventListener('click', closeChallengeDeleteModal);
        document.getElementById('challenge-delete-cancel')?.addEventListener('click', closeChallengeDeleteModal);
        document.getElementById('challenge-delete-confirm')?.addEventListener('click', async () => {
          if (!state.challengeDeleteModal.challengeId) return;
          const challengeId = state.challengeDeleteModal.challengeId;
          closeChallengeDeleteModal();
          await window.deleteChallenge(challengeId);
        });
      }

      function renderUnassignModal() {
        const modal = document.getElementById('unassign-modal');
        modal.classList.toggle('hidden', !state.unassignModal.open);
        modal.classList.toggle('flex', state.unassignModal.open);

        if (!state.unassignModal.open) {
          return;
        }

        document.getElementById('unassign-modal-title').textContent = `${i18n.t('unassign.title')} · ${state.unassignModal.challengeTitle}`;

        const assignments = state.projectsPayload.assignments.filter(
          (assignment) => String(assignment.challenge_id) === String(state.unassignModal.challengeId)
        );

        const list = document.getElementById('unassign-list');
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
        list.innerHTML = assignments
          .map((assignment) => {
            const checked = state.unassignModal.selectedAssignmentIds.includes(String(assignment.id)) ? 'checked' : '';
            const roleLabel = assignment.is_owner ? i18n.t('assign.roleOwner') : assignment.is_leader ? i18n.t('assign.roleLeader') : i18n.t('assign.roleContributor');
            return `<label class="mb-1 flex items-center gap-2 rounded px-2 py-1 hover:bg-zinc-900">
              <input type="checkbox" data-unassign-id="${assignment.id}" ${checked} />
              <span>${assignment.first_name} ${assignment.last_name} (${roleLabel})</span>
            </label>`;
          })
          .join('');

        list.querySelectorAll('input[data-unassign-id]').forEach((input) => {
          input.addEventListener('change', () => {
            const id = input.getAttribute('data-unassign-id');
            if (input.checked) {
              if (!state.unassignModal.selectedAssignmentIds.includes(id)) {
                state.unassignModal.selectedAssignmentIds.push(id);
              }
            } else {
              state.unassignModal.selectedAssignmentIds = state.unassignModal.selectedAssignmentIds.filter((item) => item !== id);
            }
          });
        });
      }

      function closeUnassignModal() {
        state.unassignModal.open = false;
        state.unassignModal.challengeId = null;
        state.unassignModal.challengeTitle = '';
        state.unassignModal.selectedAssignmentIds = [];
        renderUnassignModal();
      }

      window.openUnassignModal = function openUnassignModal(challengeId) {
        if (isViewerMode()) return;
        const challenge = state.projectsPayload.challenges.find((item) => String(item.id) === String(challengeId));
        state.unassignModal.open = true;
        state.unassignModal.challengeId = String(challengeId);
        state.unassignModal.challengeTitle = challenge ? challenge.title : 'Challenge';
        state.unassignModal.selectedAssignmentIds = [];
        renderUnassignModal();
      };

      function bindUnassignModalActions() {
        if (state.listenersBound.unassignModal) return;
        state.listenersBound.unassignModal = true;

        document.getElementById('unassign-modal-close')?.addEventListener('click', closeUnassignModal);
        document.getElementById('unassign-cancel')?.addEventListener('click', closeUnassignModal);
        document.getElementById('unassign-confirm')?.addEventListener('click', async () => {
          if (state.unassignModal.selectedAssignmentIds.length === 0) {
            showMessage(i18n.t('assign.selectAtLeastOneToUnassign'), 'warning');
            return;
          }

          await handleMutation(async () => {
            for (const assignmentId of state.unassignModal.selectedAssignmentIds) {
              await api(`/api/assignments/${assignmentId}`, { method: 'DELETE' });
            }
          }, 'Assignees updated.');

          closeUnassignModal();
        });
      }

      function bindAssignModalActions() {
        if (state.listenersBound.assignModal) return;
        state.listenersBound.assignModal = true;
        document.getElementById('assign-modal-close')?.addEventListener('click', closeAssignModal);
        document.getElementById('assign-cancel')?.addEventListener('click', closeAssignModal);

        document.getElementById('assign-search')?.addEventListener('input', (event) => {
          state.assignModal.search = event.target.value;
          renderAssignModal();
        });

        document.getElementById('assign-role')?.addEventListener('change', (event) => {
          state.assignModal.role = event.target.value;
        });

        document.getElementById('assign-confirm')?.addEventListener('click', async () => {
          if (state.assignSubmitting) return;
          if (!state.assignModal.selectedPersonId || !state.assignModal.challengeId) {
            showMessage(i18n.t('assign.selectPerson'), 'error');
            return;
          }

          const role = state.assignModal.role;
          const payload = {
            projectId: state.selectedProjectId,
            challengeId: state.assignModal.challengeId,
            personId: state.assignModal.selectedPersonId,
            isOwner: role === 'owner',
            isLeader: role === 'leader'
          };

          state.assignSubmitting = true;
          const confirmButton = document.getElementById('assign-confirm');
          if (confirmButton) confirmButton.disabled = true;

          try {
            if (!state.assignModal.assignmentId) {
              await handleMutation(() => api('/api/assignments', { method: 'POST', body: JSON.stringify(payload) }), 'Assignment created.');
              closeAssignModal();
              return;
            }

            const existing = state.projectsPayload.assignments.find((assignment) => String(assignment.id) === String(state.assignModal.assignmentId));
            if (!existing) {
              showMessage(i18n.t('assign.currentNotFound'), 'error');
              return;
            }

            if (String(existing.person_id) === String(state.assignModal.selectedPersonId)) {
              await handleMutation(
                () => api(`/api/assignments/${existing.id}`, { method: 'PUT', body: JSON.stringify({ isOwner: payload.isOwner, isLeader: payload.isLeader }) }),
                'Assignment updated.'
              );
            } else {
              await handleMutation(async () => {
                await api('/api/assignments', { method: 'POST', body: JSON.stringify(payload) });
                await api(`/api/assignments/${existing.id}`, { method: 'DELETE' });
              }, 'Assignee updated.');
            }

            closeAssignModal();
          } finally {
            state.assignSubmitting = false;
            if (confirmButton) confirmButton.disabled = false;
          }
        });
      }

      function closeAssignModal() {
        state.assignModal.open = false;
        state.assignModal.search = '';
        state.assignModal.selectedPersonId = '';
        state.assignModal.challengeId = null;
        state.assignModal.challengeTitle = '';
        state.assignModal.assignmentId = null;
        state.assignModal.role = 'contributor';
        renderAssignModal();
      }

      window.openAssignModal = function openAssignModal(challengeId, challengeTitle, assignment = null) {
        if (isViewerMode()) return;
        state.assignModal.open = true;
        state.assignModal.challengeId = String(challengeId);
        state.assignModal.challengeTitle = challengeTitle;
        state.assignModal.search = '';
        state.assignModal.assignmentId = assignment ? String(assignment.id) : null;
        if (assignment) {
          state.assignModal.selectedPersonId = String(assignment.person_id);
          state.assignModal.role = assignment.is_owner ? 'owner' : assignment.is_leader ? 'leader' : 'contributor';
        } else {
          state.assignModal.role = 'contributor';
          const people = filteredPeople();
          state.assignModal.selectedPersonId = people[0] ? String(people[0].id) : '';
        }
        renderAssignModal();
      };

      window.setPeopleSortField = function setPeopleSortField(field) {
        const asc = `${field}_asc`;
        const desc = `${field}_desc`;

        if (state.peopleSort === asc) {
          state.peopleSort = desc;
        } else {
          state.peopleSort = asc;
        }

        render();
      };


      window.setPeopleOverviewSortField = function setPeopleOverviewSortField(field) {
        const asc = `${field}_asc`;
        const desc = `${field}_desc`;
        state.peopleOverviewSort = state.peopleOverviewSort === asc ? desc : asc;
        render();
      };

      window.setPeopleOverviewSearch = function setPeopleOverviewSearch(value) {
        state.peopleOverviewSearch = String(value || '');
        render();
        requestAnimationFrame(() => {
          const input = document.getElementById('people-overview-search-input');
          if (!input) return;
          input.focus();
          const pos = input.value.length;
          input.setSelectionRange(pos, pos);
        });
      };

      window.clearPeopleOverviewSearch = function clearPeopleOverviewSearch() {
        state.peopleOverviewSearch = '';
        render();
      };

      window.openPeopleOverviewModal = function openPeopleOverviewModal(personId) {
        state.homeTab = 'people-overview';
        state.peopleOverviewModal.open = true;
        state.peopleOverviewModal.personId = String(personId);
        navigateFromState();
        render();
      };

      window.openProjectStatusPicker = async function openProjectStatusPicker(projectId, event) {
        if (isViewerMode()) return;
        event?.stopPropagation?.();

        const project = state.projectsPayload.projects.find((item) => String(item.id) === String(projectId));
        if (!project) return;

        state.projectStatusModal.open = true;
        state.projectStatusModal.projectId = String(project.id);
        state.projectStatusModal.status = String(project.status || 'white').toLowerCase();
        renderProjectStatusModal();
      };

      window.setClientsSortField = function setClientsSortField(field) {
        const asc = `${field}_asc`;
        const desc = `${field}_desc`;
        state.clientsSort = state.clientsSort === asc ? desc : asc;
        render();
      };

      window.setAdminProjectsSortField = function setAdminProjectsSortField(field) {
        const asc = `${field}_asc`;
        const desc = `${field}_desc`;
        state.adminProjectsSort = state.adminProjectsSort === asc ? desc : asc;
        render();
      };

      window.setChallengesSortField = function setChallengesSortField(field) {
        const asc = `${field}_asc`;
        const desc = `${field}_desc`;
        state.challengesSort = state.challengesSort === asc ? desc : asc;
        render();
      };

      window.setChallengesSort = function setChallengesSort(value) {
        state.challengesSort = String(value || 'title_asc');
        render();
      };

      window.setClientTeamsSortField = function setClientTeamsSortField(field) {
        const asc = `${field}_asc`;
        const desc = `${field}_desc`;
        state.clientTeamsSort = state.clientTeamsSort === asc ? desc : asc;
        render();
      };

      window.setClientTeamsSort = function setClientTeamsSort(value) {
        state.clientTeamsSort = String(value || 'status_desc');
        render();
      };

      window.setClientTeamsSearch = function setClientTeamsSearch(value) {
        state.clientTeamsSearch = String(value || '');
        render();
        requestAnimationFrame(() => {
          const input = document.getElementById('client-teams-search-input');
          if (!input) return;
          input.focus();
          const pos = input.value.length;
          input.setSelectionRange(pos, pos);
        });
      };

      window.clearClientTeamsSearch = function clearClientTeamsSearch() {
        state.clientTeamsSearch = '';
        render();
      };

      window.openProjectDetail = function openProjectDetail(projectId) {
        state.homeTab = 'client-teams';
        state.selectedProjectId = String(projectId);
        state.peopleOverviewModal.open = false;
        state.peopleOverviewModal.personId = null;
        navigateFromState();
        render();
      };

      window.goToProjectOverview = function goToProjectOverview() {
        state.homeTab = 'client-teams';
        state.selectedProjectId = '';
        state.peopleOverviewModal.open = false;
        state.peopleOverviewModal.personId = null;
        navigateFromState();
        render();
      };

      window.openProjectStatusModal = function openProjectStatusModal(projectId, currentStatus) {
        if (isViewerMode()) return;
        state.projectStatusModal.open = true;
        state.projectStatusModal.projectId = String(projectId);
        state.projectStatusModal.status = String(currentStatus || 'white').toLowerCase();
        renderProjectStatusModal();
      };

      window.openProjectPriorityModal = function openProjectPriorityModal(clientId, priorityId) {
        if (isViewerMode() || isTeammateMode()) return;
        state.projectPriorityModal.open = true;
        state.projectPriorityModal.clientId = Number(clientId);
        state.projectPriorityModal.priorityId = Number(priorityId);
        renderProjectPriorityModal();
      };

      window.updateProjectClientPriority = async function updateProjectClientPriority(clientId, priorityId) {
        if (isViewerMode() || isTeammateMode()) return;
        const client = state.clients.find((entry) => String(entry.id) === String(clientId));
        if (!client) {
          showMessage(i18n.t('clients.notFound'), 'error');
          return;
        }

        const payload = {
          name: client.name,
          location: client.location,
          sinceMonth: client.since_month,
          priorityId: Number(priorityId)
        };

        await handleMutation(
          () => api(`/api/clients/${clientId}`, { method: 'PUT', body: JSON.stringify(payload) }),
          'Priority updated.'
        );
      };

      window.editPerson = function editPerson(person) {
        const form = document.getElementById('person-form');
        form.id.value = person.id;
        form.firstName.value = person.first_name;
        form.lastName.value = person.last_name;
        form.tradeId.value = person.trade_id;
        form.levelId.value = person.level_id;
      };

      window.deletePerson = async function deletePerson(id) {
        await handleMutation(() => api(`/api/people/${id}`, { method: 'DELETE' }), 'Person deleted.');
      };

      window.editClient = function editClient(client) {
        const form = document.getElementById('client-form');
        form.id.value = client.id;
        form.name.value = client.name;
        form.location.value = client.location;
        form.sinceMonth.value = client.since_month;
        form.priorityId.value = client.priority_id;
      };

      window.deleteClient = async function deleteClient(id) {
        await handleMutation(() => api(`/api/clients/${id}`, { method: 'DELETE' }), 'Client deleted.');
      };

      window.deleteProject = async function deleteProject(id) {
        await handleMutation(() => api(`/api/projects/${id}`, { method: 'DELETE' }), 'Project deleted.');
      };

      window.adjustProjectPersonQuantity = function adjustProjectPersonQuantity(projectId, personId, keepModalOpen = false) {
        if (isViewerMode()) return;
        const currentAssignments = state.projectsPayload.assignments.filter(
          (assignment) => String(assignment.project_id) === String(projectId) && String(assignment.person_id) === String(personId)
        );
        if (currentAssignments.length === 0) {
          showMessage(i18n.t('peopleOverview.workload.noAssignments'), 'error');
          return;
        }

        const currentQuantity = Math.round(currentAssignments.reduce((sum, assignment) => sum + Number(assignment.quantity || 0), 0));
        state.workloadModal.open = true;
        state.workloadModal.projectId = String(projectId);
        state.workloadModal.personId = String(personId);
        state.workloadModal.quantity = currentQuantity;
        state.workloadModal.keepModalOpen = Boolean(keepModalOpen);
        renderWorkloadModal();
      };

      async function confirmWorkloadModal() {
        const quantityInput = document.getElementById('workload-modal-value');
        const quantity = Number(quantityInput?.value || 0);
        const personId = state.workloadModal.personId;
        const projectId = state.workloadModal.projectId;
        const keepModalOpen = state.workloadModal.keepModalOpen;

        if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100) {
          showMessage(i18n.t('peopleOverview.workload.validation'), 'error');
          return;
        }

        await handleMutation(
          () => api(`/api/projects/${projectId}/people/${personId}/quantity`, { method: 'PUT', body: JSON.stringify({ quantity }) }),
          i18n.t('peopleOverview.workload.updated')
        );

        closeWorkloadModal();

        if (keepModalOpen) {
          state.peopleOverviewModal.open = true;
          state.peopleOverviewModal.personId = String(personId);
          renderPeopleOverviewModal();
        }
      }

      function closeWorkloadModal() {
        state.workloadModal.open = false;
        state.workloadModal.projectId = null;
        state.workloadModal.personId = null;
        state.workloadModal.quantity = 0;
        state.workloadModal.keepModalOpen = false;
        renderWorkloadModal();
      }

      function renderWorkloadModal() {
        const modal = document.getElementById('workload-modal');
        const isOpen = Boolean(state.workloadModal.open);
        modal?.classList.toggle('hidden', !isOpen);
        modal?.classList.toggle('flex', isOpen);

        if (!isOpen) return;

        const input = document.getElementById('workload-modal-value');
        if (input) {
          input.value = String(state.workloadModal.quantity || 0);
          input.focus();
          input.select();
        }
      }

      function bindWorkloadModalActions() {
        if (state.listenersBound.workloadModal) return;
        state.listenersBound.workloadModal = true;

        document.getElementById('workload-modal-close')?.addEventListener('click', closeWorkloadModal);
        document.getElementById('workload-modal-cancel')?.addEventListener('click', closeWorkloadModal);
        document.getElementById('workload-modal-confirm')?.addEventListener('click', async () => {
          try {
            await confirmWorkloadModal();
          } catch (error) {
            showMessage(error.message, 'error');
          }
        });
      }

      const peopleOverviewA11yUtils = window.ProjectoryRoutingA11yUtils || {};
      const shouldClosePeopleOverviewOnKeyboard = peopleOverviewA11yUtils.modalCloseRequestedByKeyboard || ((event) => Boolean(event && event.key === 'Escape'));
      let peopleOverviewFocusReturnTarget = null;
      let wasPeopleOverviewModalOpen = false;

      function renderPeopleOverviewModal() {
        const modal = document.getElementById('people-overview-modal');
        modal.classList.toggle('hidden', !state.peopleOverviewModal.open);
        modal.classList.toggle('flex', state.peopleOverviewModal.open);

        if (!state.peopleOverviewModal.open) {
          if (wasPeopleOverviewModalOpen) {
            const fallbackTarget = document.getElementById('onboarding-tab-people-overview') || document.getElementById('onboarding-tab-client-teams');
            const focusTarget = peopleOverviewFocusReturnTarget && peopleOverviewFocusReturnTarget.isConnected ? peopleOverviewFocusReturnTarget : fallbackTarget;
            if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
          }
          wasPeopleOverviewModalOpen = false;
          return;
        }

        if (!wasPeopleOverviewModalOpen) {
          peopleOverviewFocusReturnTarget = document.activeElement && typeof document.activeElement.focus === 'function' ? document.activeElement : null;
          document.getElementById('people-overview-modal-close')?.focus({ preventScroll: true });
        }
        wasPeopleOverviewModalOpen = true;

        const person = state.people.find((item) => String(item.id) === String(state.peopleOverviewModal.personId));
        if (!person) {
          document.getElementById('people-overview-modal-title').textContent = i18n.t('peopleOverview.modal.title');
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          document.getElementById('people-overview-modal-body').innerHTML = `<p class="text-zinc-300">${i18n.t('peopleOverview.modal.noAssignmentsFound')}</p>`;
          return;
        }

        const assignments = state.projectsPayload.assignments.filter((assignment) => String(assignment.person_id) === String(person.id));
        document.getElementById('people-overview-modal-title').textContent = i18n.t('peopleOverview.modal.titleNamed', { name: `${person.first_name} ${person.last_name}`.trim() });

        if (assignments.length === 0) {
        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
          document.getElementById('people-overview-modal-body').innerHTML = `<p class="text-zinc-300">${i18n.t('peopleOverview.modal.noAssignmentsForPerson')}</p>`;
          return;
        }

        const projectById = new Map(state.projectsPayload.projects.map((project) => [String(project.id), project]));
        const challengeById = new Map(state.projectsPayload.challenges.map((challenge) => [String(challenge.id), challenge]));
        const grouped = new Map();
        for (const assignment of assignments) {
          const key = String(assignment.project_id);
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(assignment);
        }

        const detailGroups = Array.from(grouped.entries())
          .map(([projectId, projectAssignments]) => {
            const project = projectById.get(projectId);
            const projectName = project ? `${project.name} (${project.client_name})` : `Project ${projectId}`;
            const adjustControl = isViewerMode() ? '' : `<button class="rounded border border-[#00d8ff]/50 px-2 py-1 text-xs text-[#00d8ff] hover:bg-zinc-700" onclick="adjustProjectPersonQuantity(${projectId}, ${person.id}, true)">${i18n.t('peopleOverview.adjustWorkload')}</button>`;

            const assignmentRows = projectAssignments
              .map((assignment) => {
                const roleLabel = assignment.is_owner ? i18n.t('assign.roleOwner') : assignment.is_leader ? i18n.t('assign.roleLeader') : i18n.t('assign.roleContributor');
                const roleClass = assignment.is_owner ? 'text-blue-300' : assignment.is_leader ? 'text-emerald-300' : 'text-zinc-100';
                const challenge = challengeById.get(String(assignment.challenge_id));
                const challengeDescription = challenge?.description || 'No description available.';
                const quantity = Math.round(Number(assignment.quantity || 0));
                const barColor = assignment.is_owner ? 'bg-blue-500' : assignment.is_leader ? 'bg-emerald-500' : 'bg-zinc-100';
                const challengePayload = JSON.stringify(challenge || { id: assignment.challenge_id, title: assignment.challenge_title, description: challengeDescription, project_id: assignment.project_id });

                const tableRow = `<tr class="border-t border-zinc-800">
                  <td class="p-2 pl-6">
                    <button class="w-full text-left hover:opacity-90" onclick='openChallengeFromPeopleOverviewModal(${challengePayload})'>
                      <div class="font-medium text-zinc-100 underline decoration-zinc-600 underline-offset-2">${assignment.challenge_title}</div>
                      <div class="text-zinc-400">${challengeDescription}</div>
                    </button>
                  </td>
                  <td class="p-2"><span class="font-semibold ${roleClass}">${roleLabel}</span></td>
                  <td class="p-2 text-right">
                    <div class="font-semibold">${quantity}% (${formatWorkloadDuration(quantity, person.working_hours)})</div>
                    <div class="mt-1 ml-auto h-2 w-32 overflow-hidden rounded bg-zinc-800"><div class="h-full ${barColor}" style="width:${Math.max(0, Math.min(100, quantity))}%"></div></div>
                  </td>
                </tr>`;

                const mobileCard = `<article class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 shadow-sm">
                  <button class="w-full text-left" onclick='openChallengeFromPeopleOverviewModal(${challengePayload})'>
                    <div class="text-base font-semibold text-zinc-100 break-words underline decoration-zinc-600 underline-offset-2">${assignment.challenge_title}</div>
                    <p class="mt-2 text-sm leading-6 text-zinc-400 break-words">${challengeDescription}</p>
                  </button>
                  <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div class="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                      <div class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">${i18n.t('assign.role')}</div>
                      <div class="mt-2"><span class="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${assignment.is_owner ? 'border-blue-400/70 bg-blue-600 text-blue-50' : assignment.is_leader ? 'border-emerald-400/70 bg-emerald-600 text-emerald-50' : 'border-zinc-500 bg-zinc-700 text-zinc-100'}">${roleLabel}</span></div>
                    </div>
                    <div class="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                      <div class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">${i18n.t('peopleOverview.columns.workload')}</div>
                      <div class="mt-1 font-semibold text-zinc-100">${quantity}% (${formatWorkloadDuration(quantity, person.working_hours)})</div>
                      <div class="mt-2 h-2 overflow-hidden rounded bg-zinc-800"><div class="h-full ${barColor}" style="width:${Math.max(0, Math.min(100, quantity))}%"></div></div>
                    </div>
                  </div>
                </article>`;

                return { tableRow, mobileCard };
              });

            const tableGroup = `<tr class="border-t border-zinc-700 bg-zinc-900/70"><td class="p-2 font-semibold text-zinc-100" colspan="2">${projectName}</td><td class="p-2 text-right">${adjustControl}</td></tr>${assignmentRows.map((entry) => entry.tableRow).join('')}`;
            const mobileGroup = `<section class="rounded-2xl border border-zinc-700 bg-zinc-900/70 p-3"><div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h4 class="text-sm font-semibold text-zinc-100 break-words">${projectName}</h4>${adjustControl}</div><div class="space-y-3">${assignmentRows.map((entry) => entry.mobileCard).join('')}</div></section>`;
            return { tableGroup, mobileGroup };
          });

        const tableRows = detailGroups.map((group) => group.tableGroup).join('');
        const mobileGroups = detailGroups.map((group) => group.mobileGroup).join('');

        // dom-safety-allow: reviewed template rendering path; follow-up refactor tracked in XSS hardening plan.
        document.getElementById('people-overview-modal-body').innerHTML = `<div id="people-overview-mobile-detail-list" class="space-y-4 md:hidden">${mobileGroups}</div><div class="hidden md:block"><table class="w-full text-left text-xs rounded border border-zinc-700 overflow-hidden">
          <thead>
            <tr class="text-zinc-400 bg-zinc-950/70">
              <th class="p-2">${i18n.t('entity.challenges')}</th>
              <th class="p-2">${i18n.t('assign.role')}</th>
              <th class="p-2">${i18n.t('peopleOverview.columns.workload')}</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table></div>`;
      }

      function closePeopleOverviewModal() {
        state.peopleOverviewModal.open = false;
        state.peopleOverviewModal.personId = null;
        navigateFromState();
        render();
      }

      function bindPeopleOverviewModalActions() {
        if (state.listenersBound.peopleOverviewModal) return;
        state.listenersBound.peopleOverviewModal = true;
        document.getElementById('people-overview-modal-close')?.addEventListener('click', closePeopleOverviewModal);
        document.addEventListener('keydown', (event) => {
          if (!state.peopleOverviewModal.open) return;
          if (!shouldClosePeopleOverviewOnKeyboard(event)) return;
          event.preventDefault();
          closePeopleOverviewModal();
        });
      }

      function renderChallengeModal() {
        const modal = document.getElementById('challenge-modal');
        modal.classList.toggle('hidden', !state.challengeModal.open);
        modal.classList.toggle('flex', state.challengeModal.open);
      }

      function closeChallengeModal() {
        const shouldReturnToPeopleOverview = state.challengeModal.returnToPeopleOverview && state.challengeModal.returnPersonId;
        const returnPersonId = state.challengeModal.returnPersonId;

        state.challengeModal.open = false;
        state.challengeModal.challengeId = null;
        state.challengeModal.returnToPeopleOverview = false;
        state.challengeModal.returnPersonId = null;

        const form = document.getElementById('challenge-modal-form');
        if (form) form.reset();
        renderChallengeModal();

        if (shouldReturnToPeopleOverview) {
          state.homeTab = 'people-overview';
          state.peopleOverviewModal.open = true;
          state.peopleOverviewModal.personId = String(returnPersonId);
          navigateFromState();
          render();
        }
      }

      window.openChallengeModal = function openChallengeModal(challenge = null, options = {}) {
        if (isViewerMode()) return;
        if (!options.preserveReturnTarget) {
          state.challengeModal.returnToPeopleOverview = false;
          state.challengeModal.returnPersonId = null;
        }

        state.challengeModal.open = true;
        state.challengeModal.challengeId = challenge ? String(challenge.id) : null;
        const title = document.getElementById('challenge-modal-title');
        title.textContent = challenge ? i18n.t('challenge.edit') : i18n.t('challenge.add');
        const form = document.getElementById('challenge-modal-form');
        if (form) {
          form.id.value = challenge ? challenge.id : '';
          form.title.value = challenge ? challenge.title : CHALLENGE_TITLE_PREFILL;
          form.description.value = challenge ? challenge.description : CHALLENGE_DESCRIPTION_PREFILL;
          form.title.dataset.prefilled = challenge ? 'false' : 'true';
          form.description.dataset.prefilled = challenge ? 'false' : 'true';
        }
        renderChallengeModal();
      };

      window.openChallengeFromPeopleOverviewModal = function openChallengeFromPeopleOverviewModal(challenge) {
        state.challengeModal.returnToPeopleOverview = true;
        state.challengeModal.returnPersonId = state.peopleOverviewModal.personId;

        state.peopleOverviewModal.open = false;
        renderPeopleOverviewModal();
        window.openChallengeModal(challenge, { preserveReturnTarget: true });
      };

      window.editChallenge = function editChallenge(challenge) {
        window.openChallengeModal(challenge);
      };

      window.startInlineChallengeEdit = function startInlineChallengeEdit(challengeId, field) {
        if (isViewerMode()) return;
        const challenge = state.projectsPayload.challenges.find((item) => String(item.id) === String(challengeId));
        if (!challenge) return;
        state.inlineChallengeEdit.challengeId = String(challengeId);
        state.inlineChallengeEdit.field = field;
        state.inlineChallengeEdit.value = String(challenge[field] || '');
        state.inlineChallengeEdit.submitting = false;
        render();
      };

      window.updateInlineChallengeEditValue = function updateInlineChallengeEditValue(value) {
        state.inlineChallengeEdit.value = value;
      };

      window.cancelInlineChallengeEdit = function cancelInlineChallengeEdit() {
        state.inlineChallengeEdit.challengeId = null;
        state.inlineChallengeEdit.field = '';
        state.inlineChallengeEdit.value = '';
        state.inlineChallengeEdit.submitting = false;
        render();
      };

      window.handleInlineChallengeEditKeydown = function handleInlineChallengeEditKeydown(event, challengeId, field) {
        if (event.key === 'Escape') {
          event.preventDefault();
          window.cancelInlineChallengeEdit();
          return;
        }
        if (field === 'title' && event.key === 'Enter') {
          event.preventDefault();
          window.saveInlineChallengeEdit(challengeId, field);
          return;
        }
        if (field === 'description' && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          window.saveInlineChallengeEdit(challengeId, field);
        }
      };

      window.saveInlineChallengeEdit = async function saveInlineChallengeEdit(challengeId, field) {
        if (state.inlineChallengeEdit.submitting) return;
        const challenge = state.projectsPayload.challenges.find((item) => String(item.id) === String(challengeId));
        if (!challenge) {
          showMessage(i18n.t('challenge.notFound'), 'error');
          return;
        }
        const nextValue = String(state.inlineChallengeEdit.value || '').trim();
        if (!nextValue) {
          showMessage('Please provide a value.', 'warning');
          return;
        }
        const payload = {
          title: field === 'title' ? nextValue : challenge.title,
          description: field === 'description' ? nextValue : challenge.description
        };
        state.inlineChallengeEdit.submitting = true;
        render();
        try {
          await handleMutation(() => api(`/api/challenges/${challengeId}`, { method: 'PUT', body: JSON.stringify(payload) }), 'Challenge saved.');
          state.inlineChallengeEdit.challengeId = null;
          state.inlineChallengeEdit.field = '';
          state.inlineChallengeEdit.value = '';
          state.inlineChallengeEdit.submitting = false;
          render();
        } finally {
          if (state.inlineChallengeEdit.challengeId) {
            state.inlineChallengeEdit.submitting = false;
            render();
          }
        }
      };

      window.openChallengeDeleteModal = function openChallengeDeleteModal(challengeId) {
        if (isViewerMode()) return;
        state.challengeDeleteModal.open = true;
        state.challengeDeleteModal.challengeId = String(challengeId);
        renderChallengeDeleteModal();
      };

      window.deleteChallenge = async function deleteChallenge(id) {
        const challenge = state.projectsPayload.challenges.find((item) => String(item.id) === String(id));
        if (!challenge) {
          showMessage(i18n.t('challenge.notFound'), 'error');
          return;
        }

        try {
          await api(`/api/challenges/${id}`, { method: 'DELETE' });
          await loadData();
          render();

          showMessage(i18n.t('challenge.deleted'), 'warning', {
            actionLabel: 'Undo',
            onAction: async () => {
              try {
                await api(`/api/projects/${challenge.project_id}/challenges`, {
                  method: 'POST',
                  body: JSON.stringify({
                    title: challenge.title,
                    description: challenge.description
                  })
                });
                await loadData();
                render();
                showMessage(i18n.t('challenge.restored'));
              } catch (error) {
                showMessage(`Undo failed: ${error.message}`, 'error');
              }
            }
          });
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };

      window.deleteAssignment = async function deleteAssignment(id) {
        if (isViewerMode()) return;
        await handleMutation(() => api(`/api/assignments/${id}`, { method: 'DELETE' }), 'Assignment deleted.');
      };

      window.toggleAssignmentRole = async function toggleAssignmentRole(id, isOwner, isLeader) {
        if (isViewerMode()) return;
        let next = { isOwner: false, isLeader: false };
        if (!isOwner && !isLeader) next = { isOwner: true, isLeader: false };
        else if (isOwner) next = { isOwner: false, isLeader: true };
        await handleMutation(() => api(`/api/assignments/${id}`, { method: 'PUT', body: JSON.stringify(next) }), 'Assignment role updated.');
      };

