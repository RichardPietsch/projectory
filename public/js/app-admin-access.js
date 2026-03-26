      async function loadAdminAccessData() {
        // Step 6: preload admin access-management data for a single cohesive tab.
        try {
          state.adminUsers = await api('/api/admin/users');
        } catch (_error) {
          state.adminUsers = [];
        }

        try {
          state.smtpSettings = await api('/api/admin/smtp-settings');
          if (!state.smtpTestRecipient) {
            state.smtpTestRecipient = String(state.smtpSettings?.fromEmail || '').trim();
          }
        } catch (_error) {
          state.smtpSettings = { host: '', port: '', username: '', fromEmail: '', secure: true, enabled: false, passwordSet: false };
          if (!state.smtpTestRecipient) {
            state.smtpTestRecipient = '';
          }
        }

        try {
          const audit = await api('/api/admin/audit?limit=100');
          state.auditEntries = Array.isArray(audit?.entries) ? audit.entries : [];
        } catch (_error) {
          state.auditEntries = [];
        }
      }

      async function loadData(options = {}) {
        const forceAppData = Boolean(options.forceAppData);
        const bootstrapStatus = await api('/api/auth/bootstrap-status');
        state.initialRegistration.required = Boolean(bootstrapStatus?.registrationOpen);
        state.auth = await api('/api/auth/me');
        state.authRequired = forceAppData ? false : state.auth?.authSource !== 'session';

        if (state.authRequired && !forceAppData) {
          state.meta = { priorities: [], trades: [], levels: [], projectStatuses: [] };
          state.people = [];
          state.clients = [];
          state.projectsPayload = { projects: [], challenges: [], assignments: [] };
          state.configuration = { trades: [], levels: [], priorities: [], projectStatuses: [] };
          state.configurationDraft = { trades: [], levels: [], priorities: [], projectStatuses: [] };
          state.adminUsers = [];
          state.auditEntries = [];
          return;
        }

        state.meta = await api('/api/meta');
        state.people = await api('/api/people');
        state.clients = await api('/api/clients');
        state.projectsPayload = await api('/api/projects');
        if (canAccessAdmin()) {
          try {
            state.configuration = await api('/api/configuration');
          } catch (_error) {
            state.configuration = { trades: [], levels: [], priorities: [], projectStatuses: [] };
          }
          await loadAdminAccessData();
        }
          state.configurationDraft = {
            trades: (state.configuration.trades || []).map((row) => ({ ...row })),
            levels: (state.configuration.levels || []).map((row) => ({ ...row, sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0) })),
            priorities: (state.configuration.priorities || []).map((row) => ({ ...row, colorHex: row.colorHex || row.color_hex, sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0) })),
            projectStatuses: (state.configuration.projectStatuses || []).map((row) => ({ ...row, name: row.label || row.name, colorHex: row.colorHex || row.color_hex, sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0) }))
          };

      }

      function normalizeConfigurationDraftNames(items) {
        const unique = [];
        const seen = new Set();
        for (const item of items || []) {
          const name = String(item?.name || '').trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push({ ...item, name });
        }
        return unique;
      }

      async function applyConfigurationDraft(nextDraft, successMessage) {
        const forceAppData = state.auth?.authSource !== 'session';
        const previousDraft = {
          trades: (state.configurationDraft.trades || []).map((item) => ({ ...item })),
          levels: (state.configurationDraft.levels || []).map((item) => ({ ...item })),
          priorities: (state.configurationDraft.priorities || []).map((item) => ({ ...item })),
          projectStatuses: (state.configurationDraft.projectStatuses || []).map((item) => ({ ...item }))
        };

        const trades = normalizeConfigurationDraftNames(nextDraft.trades).map((item) => ({ id: item.id || null, name: item.name }));
        const levels = normalizeConfigurationDraftNames(nextDraft.levels).map((item, index) => ({ id: item.id || null, name: item.name, sortOrder: Number(item.sortOrder || (index + 1)) }));
        const priorities = normalizeConfigurationDraftNames(nextDraft.priorities).map((item, index) => ({ id: item.id || null, name: item.name, colorHex: String(item.colorHex || '#64748B'), sortOrder: Number(item.sortOrder || (index + 1)) }));
        const projectStatuses = normalizeConfigurationDraftNames(nextDraft.projectStatuses).map((item, index) => ({ id: item.id || null, key: String(item.key || '').trim().toLowerCase() || `status_${index + 1}`, name: item.name, colorHex: String(item.colorHex || '#64748B'), sortOrder: Number(item.sortOrder || (index + 1)) }));

        await api('/api/configuration', { method: 'PUT', body: JSON.stringify({ trades, levels, priorities, projectStatuses }) });
        await loadData({ forceAppData });
        render();

        showMessage(successMessage, 'ok', {
          actionLabel: 'Undo',
          onAction: async () => {
            const undoTrades = normalizeConfigurationDraftNames(previousDraft.trades).map((item) => ({ id: item.id || null, name: item.name }));
            const undoLevels = normalizeConfigurationDraftNames(previousDraft.levels).map((item, index) => ({ id: item.id || null, name: item.name, sortOrder: Number(item.sortOrder || (index + 1)) }));
            const undoPriorities = normalizeConfigurationDraftNames(previousDraft.priorities).map((item, index) => ({ id: item.id || null, name: item.name, colorHex: String(item.colorHex || '#64748B'), sortOrder: Number(item.sortOrder || (index + 1)) }));
            const undoProjectStatuses = normalizeConfigurationDraftNames(previousDraft.projectStatuses).map((item, index) => ({ id: item.id || null, key: String(item.key || '').trim().toLowerCase() || `status_${index + 1}`, name: item.name, colorHex: String(item.colorHex || '#64748B'), sortOrder: Number(item.sortOrder || (index + 1)) }));
            try {
              await api('/api/configuration', { method: 'PUT', body: JSON.stringify({ trades: undoTrades, levels: undoLevels, priorities: undoPriorities, projectStatuses: undoProjectStatuses }) });
              await loadData({ forceAppData });
              render();
              showMessage(i18n.t('admin.configuration.messages.reverted'));
            } catch (error) {
              showMessage(`Undo failed: ${error.message}`, 'error');
            }
          }
        });
      }

      async function addConfigurationItem(kind) {
        const input = document.getElementById(`configuration-${kind}-new`);
        const value = String(input?.value || '').trim();
        if (!value) return;

        const list = [...(state.configurationDraft[kind] || [])];
        if (list.some((item) => String(item.name || '').toLowerCase() === value.toLowerCase())) {
          showMessage(`${value} already exists.`, 'error');
          return;
        }

        list.push({ id: null, name: value, usage_count: 0, isNew: true, colorHex: '#64748B', sortOrder: list.length + 1, key: kind === 'projectStatuses' ? value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : null });
        const normalizedList = normalizeConfigurationSortOrder(list, kind);
        const nextDraft = {
          trades: kind === 'trades' ? normalizedList : [...(state.configurationDraft.trades || [])],
          levels: kind === 'levels' ? normalizedList : [...(state.configurationDraft.levels || [])],
          priorities: kind === 'priorities' ? normalizedList : [...(state.configurationDraft.priorities || [])],
          projectStatuses: kind === 'projectStatuses' ? normalizedList : [...(state.configurationDraft.projectStatuses || [])]
        };
        if (input) input.value = '';
        try {
          await applyConfigurationDraft(nextDraft, `${value} added to ${kind}.`);
        } catch (error) {
          showMessage(error.message, 'error');
        }
      }

      async function removeConfigurationItem(kind, idOrName) {
        const list = [...(state.configurationDraft[kind] || [])];
        const hasId = Number.isInteger(Number(idOrName));
        const entry = hasId
          ? list.find((item) => Number(item.id) === Number(idOrName))
          : list.find((item) => String(item.name || '').toLowerCase() === String(idOrName || '').toLowerCase());
        if (!entry) return;
        if (Number(entry.usage_count || 0) > 0) {
          showMessage(`${entry.name} is in use and cannot be removed.`, 'error');
          return;
        }
        const updatedList = hasId
          ? list.filter((item) => Number(item.id) !== Number(idOrName))
          : list.filter((item) => String(item.name || '').toLowerCase() !== String(idOrName || '').toLowerCase());
        const normalizedList = normalizeConfigurationSortOrder(updatedList, kind);
        const nextDraft = {
          trades: kind === 'trades' ? normalizedList : [...(state.configurationDraft.trades || [])],
          levels: kind === 'levels' ? normalizedList : [...(state.configurationDraft.levels || [])],
          priorities: kind === 'priorities' ? normalizedList : [...(state.configurationDraft.priorities || [])],
          projectStatuses: kind === 'projectStatuses' ? normalizedList : [...(state.configurationDraft.projectStatuses || [])]
        };
        try {
          await applyConfigurationDraft(nextDraft, `${entry.name} removed from ${kind}.`);
        } catch (error) {
          showMessage(error.message, 'error');
        }
      }


      async function updateConfigurationItemField(kind, idOrName, field, value) {
        const list = [...(state.configurationDraft[kind] || [])];
        const entry = list.find((item) => String(item.id || item.key || item.name) === String(idOrName));
        if (!entry) return;
        if (field === 'name') entry.name = String(value || '').trim();
        if (field === 'colorHex') entry.colorHex = String(value || '#64748B');
        if (field === 'sortOrder') entry.sortOrder = Number(value || 0);
        if (!entry.name) return;
        const nextDraft = { ...state.configurationDraft, [kind]: list };
        try {
          await applyConfigurationDraft(nextDraft, `${entry.name} updated.`);
        } catch (error) {
          showMessage(error.message, 'error');
        }
      }

      async function updateConfigurationPriorityPreset(idOrName, preset) {
        if (!PRIORITY_PRESET_MAP[preset]) {
          return;
        }
        await updateConfigurationItemField('priorities', idOrName, 'colorHex', PRIORITY_PRESET_MAP[preset].hex);
      }

      function openConfigurationColorPicker(kind, itemKey, selectedHex) {
        state.configurationColorPicker = {
          open: true,
          kind,
          itemKey: String(itemKey),
          selectedHex: String(selectedHex || '#64748B')
        };
        render();
      }

      function closeConfigurationColorPicker() {
        state.configurationColorPicker = { open: false, kind: '', itemKey: '', selectedHex: '' };
        render();
      }

      function dragConfigurationRowStart(kind, itemKey) {
        if (!isConfigurationKindSortable(kind)) return;
        state.configurationDrag = { kind, itemKey: String(itemKey), lastOverKey: null };
      }

      function reorderConfigurationDraftList(kind, sourceItemKey, targetItemKey) {
        const list = [...(state.configurationDraft[kind] || [])]
          .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name || '').localeCompare(String(b.name || '')));
        const sourceIndex = list.findIndex((item) => String(item.id || item.key || item.name) === String(sourceItemKey));
        const targetIndex = list.findIndex((item) => String(item.id || item.key || item.name) === String(targetItemKey));
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return null;
        const [moved] = list.splice(sourceIndex, 1);
        list.splice(targetIndex, 0, moved);
        return normalizeConfigurationSortOrder(list, kind);
      }

      function dragConfigurationRowOver(event, kind, targetItemKey) {
        const dragState = state.configurationDrag;
        if (!dragState || dragState.kind !== kind || String(dragState.itemKey) === String(targetItemKey)) return;
        if (dragState.lastOverKey === String(targetItemKey)) {
          event.preventDefault();
          return;
        }

        const reordered = reorderConfigurationDraftList(kind, dragState.itemKey, targetItemKey);
        if (!reordered) return;

        dragState.lastOverKey = String(targetItemKey);
        state.configurationDrag = { ...dragState };
        state.configurationDraft = { ...state.configurationDraft, [kind]: reordered };
        render();
        event.preventDefault();
      }

      async function dropConfigurationRow(kind, targetItemKey) {
        const dragState = state.configurationDrag;
        state.configurationDrag = null;
        if (!dragState || dragState.kind !== kind) return;
        const persistedList = reorderConfigurationDraftList(kind, dragState.itemKey, targetItemKey) || [...(state.configurationDraft[kind] || [])];
        const moved = persistedList.find((item) => String(item.id || item.key || item.name) === String(dragState.itemKey));
        const nextDraft = { ...state.configurationDraft, [kind]: persistedList };
        try {
          await applyConfigurationDraft(nextDraft, `${moved?.name || 'Item'} moved.`);
        } catch (error) {
          showMessage(error.message, 'error');
        }
      }

      let configurationPanelEventsBound = false;
      function bindConfigurationPanelEvents() {
        if (configurationPanelEventsBound) return;
        configurationPanelEventsBound = true;

        document.addEventListener('click', (event) => {
          const addButton = event.target.closest('[data-config-action="add-item"]');
          if (addButton) {
            addConfigurationItem(addButton.dataset.kind);
            return;
          }

          const removeButton = event.target.closest('[data-config-action="remove-item"]');
          if (removeButton) {
            removeConfigurationItem(removeButton.dataset.kind, removeButton.dataset.itemKey);
            return;
          }

          const colorSwatch = event.target.closest('[data-config-action="pick-color"]');
          if (colorSwatch) {
            updateConfigurationItemField(colorSwatch.dataset.kind, colorSwatch.dataset.itemKey, 'colorHex', colorSwatch.dataset.color);
            closeConfigurationColorPicker();
            return;
          }

          const openColorModalButton = event.target.closest('[data-config-action="open-color-modal"]');
          if (openColorModalButton) {
            openConfigurationColorPicker(openColorModalButton.dataset.kind, openColorModalButton.dataset.itemKey, openColorModalButton.dataset.selectedHex);
            return;
          }

          const closeColorModalButton = event.target.closest('[data-config-action="close-color-modal"]');
          if (closeColorModalButton) {
            closeConfigurationColorPicker();
            return;
          }

          const colorModalOverlay = event.target.closest('[data-config-action="color-modal-overlay"]');
          if (colorModalOverlay && event.target === colorModalOverlay) {
            closeConfigurationColorPicker();
          }
        });

        document.addEventListener('focusout', (event) => {
          const nameInput = event.target.closest('[data-config-action="set-name"]');
          if (nameInput) {
            updateConfigurationItemField(nameInput.dataset.kind, nameInput.dataset.itemKey, 'name', nameInput.value);
          }
        });

        document.addEventListener('dragstart', (event) => {
          const handle = event.target.closest('[data-config-action="drag-handle"]');
          if (!handle) return;
          dragConfigurationRowStart(handle.dataset.kind, handle.dataset.itemKey);
        });

        document.addEventListener('dragover', (event) => {
          const row = event.target.closest('[data-config-action="drag-drop-target"]');
          if (!row) return;
          dragConfigurationRowOver(event, row.dataset.kind, row.dataset.itemKey);
        });

        document.addEventListener('drop', (event) => {
          const row = event.target.closest('[data-config-action="drag-drop-target"]');
          if (!row) return;
          event.preventDefault();
          dropConfigurationRow(row.dataset.kind, row.dataset.itemKey);
        });

        document.addEventListener('dragend', () => {
          state.configurationDrag = null;
        });
      }

      function optionList(items, selected) {
        return items
          .map((item) => `<option value="${item.id}" ${String(selected) === String(item.id) ? 'selected' : ''}>${item.name}</option>`)
          .join('');
      }

      function personIsVisibleInNonAdmin(person) {
        const isHidden = Boolean(person.is_hidden);
        if (!isHidden) return true;
        return Number(person.assignment_count || 0) > 0;
      }

      function personLeaverBadge(person) {
        return person.is_leaver ? `<span class="ui-badge-warning ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide">${i18n.t('people.flags.leaver')}</span>` : '';
      }

      function personHiddenBadge(person) {
        return person.is_hidden ? `<span class="ui-badge-muted ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide">${i18n.t('people.flags.hidden')}</span>` : '';
      }

      function leaverRunIcon(isLeaver) {
        return isLeaver
          ? ` <span class="inline-flex align-[-1px]" aria-label="${i18n.t('people.flags.leaver')}"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-4 15.5 2.2-5.3 2.8 2.2V22H17v-5l-3.6-2.8.6-2.2 1.8 1.5h3.2v-2h-2.5l-2.2-1.8c-.7-.6-1.7-.8-2.6-.5L8.2 10.5 6 15.8V22h2.5v-4.2l1-2.1 1.3 1.1L9.5 21Z"/></svg></span>`
          : '';
      }

      function formatWorkloadDuration(percentage, workingHours) {
        const pct = Number(percentage) || 0;
        const baseHours = Number(workingHours) || 40;
        const minutes = Math.round(((baseHours * pct) / 100) * 4) * 15;
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (mins === 0) return `${hrs}hrs`;
        return `${hrs}hrs ${mins}min`;
      }

      function peopleView() {
        return window.ProjectoryViews.renderPeopleView({
          state,
          personLeaverBadge,
          personHiddenBadge
        });
      }



      function peopleOverviewView() {
        function assignmentsWarningClass(count) {
          if (count === 0) return 'ui-section-title';
          if (count <= 5) return 'ui-text-accent';
          if (count <= 8) return 'ui-text-warning';
          return 'ui-text-danger';
        }

        function roleCountWarningClass(count) {
          if (count === 0) return 'ui-section-title';
          if (count <= 2) return 'ui-text-accent';
          if (count <= 4) return 'ui-text-warning';
          return 'ui-text-danger';
        }

        function workloadWarningClass(workload) {
          if (workload === 0) return 'ui-section-title';
          if (workload < 100) return 'ui-text-warning';
          if (workload === 100) return 'ui-text-success';
          return 'ui-text-danger';
        }

        const byPerson = new Map();
        for (const assignment of state.projectsPayload.assignments) {
          const key = String(assignment.person_id);
          if (!byPerson.has(key)) byPerson.set(key, []);
          byPerson.get(key).push(assignment);
        }

        const levelOrder = new Map(state.meta.levels.map((level, index) => [String(level.name || '').toLowerCase(), index]));
        const rowsData = state.people.filter(personIsVisibleInNonAdmin).map((person) => {
          const assignments = byPerson.get(String(person.id)) || [];
          const assignmentCount = assignments.length;
          const ownershipCount = assignments.filter((a) => a.is_owner).length;
          const leadershipCount = assignments.filter((a) => a.is_leader).length;
          const contributionsCount = assignments.filter((a) => !a.is_owner && !a.is_leader).length;
          const workloadTotal = Math.round(assignments.reduce((sum, a) => sum + Number(a.quantity || 0), 0));
          return {
            ...person,
            assignmentCount,
            ownershipCount,
            leadershipCount,
            contributionsCount,
            workloadTotal,
            nameSort: `${person.first_name} ${person.last_name}`.toLowerCase(),
            tradeSort: String(person.trade_name || '').toLowerCase(),
            levelSort: levelOrder.get(String(person.level_name || '').toLowerCase()) ?? Number.MAX_SAFE_INTEGER
          };
        });

        const peopleOverviewTerm = String(state.peopleOverviewSearch || '').trim().toLowerCase();
        const filteredRows = peopleOverviewTerm
          ? rowsData.filter((person) => {
              const searchable = [
                `${person.first_name} ${person.last_name}`,
                person.trade_name,
                person.level_name
              ]
                .join(' ')
                .toLowerCase();
              return searchable.includes(peopleOverviewTerm);
            })
          : rowsData;

        const sorted = [...filteredRows].sort((a, b) => {
          switch (state.peopleOverviewSort) {
            case 'name_desc':
              return b.nameSort.localeCompare(a.nameSort);
            case 'trade_asc':
              return a.tradeSort.localeCompare(b.tradeSort) || a.nameSort.localeCompare(b.nameSort);
            case 'trade_desc':
              return b.tradeSort.localeCompare(a.tradeSort) || a.nameSort.localeCompare(b.nameSort);
            case 'level_asc':
              return a.levelSort - b.levelSort || a.nameSort.localeCompare(b.nameSort);
            case 'level_desc':
              return b.levelSort - a.levelSort || a.nameSort.localeCompare(b.nameSort);
            case 'assignments_asc':
              return a.assignmentCount - b.assignmentCount || a.nameSort.localeCompare(b.nameSort);
            case 'assignments_desc':
              return b.assignmentCount - a.assignmentCount || a.nameSort.localeCompare(b.nameSort);
            case 'ownerships_asc':
              return a.ownershipCount - b.ownershipCount || a.nameSort.localeCompare(b.nameSort);
            case 'ownerships_desc':
              return b.ownershipCount - a.ownershipCount || a.nameSort.localeCompare(b.nameSort);
            case 'leaderships_asc':
              return a.leadershipCount - b.leadershipCount || a.nameSort.localeCompare(b.nameSort);
            case 'leaderships_desc':
              return b.leadershipCount - a.leadershipCount || a.nameSort.localeCompare(b.nameSort);
            case 'contributions_asc':
              return a.contributionsCount - b.contributionsCount || a.nameSort.localeCompare(b.nameSort);
            case 'contributions_desc':
              return b.contributionsCount - a.contributionsCount || a.nameSort.localeCompare(b.nameSort);
            case 'quantity_asc':
              return a.workloadTotal - b.workloadTotal || a.nameSort.localeCompare(b.nameSort);
            case 'quantity_desc':
              return b.workloadTotal - a.workloadTotal || a.nameSort.localeCompare(b.nameSort);
            case 'name_asc':
            default:
              return a.nameSort.localeCompare(b.nameSort);
          }
        });

        const viewerPersonId = currentPersonId();
        const rows = sorted
          .map((person) => {
            const isCurrentUser = viewerPersonId && String(person.id) === viewerPersonId;
            const rowClass = isCurrentUser
              ? 'ui-table-row ui-table-row-interactive ui-table-row-selected'
              : 'ui-table-row ui-table-row-interactive';
            return `<tr class="${rowClass}" onclick="openPeopleOverviewModal(${person.id})">
            <td class="p-2">${person.first_name} ${person.last_name}${personLeaverBadge(person)}</td>
            <td class="p-2">${person.trade_name}</td>
            <td class="p-2">${person.level_name}</td>
            <td class="p-2 font-semibold ${assignmentsWarningClass(person.assignmentCount)}">${person.assignmentCount}</td>
            <td class="p-2 font-semibold ${roleCountWarningClass(person.ownershipCount)}">${person.ownershipCount}</td>
            <td class="p-2 font-semibold ${roleCountWarningClass(person.leadershipCount)}">${person.leadershipCount}</td>
            <td class="p-2 font-semibold ${assignmentsWarningClass(person.contributionsCount)}">${person.contributionsCount}</td>
            <td class="p-2 font-semibold ${workloadWarningClass(person.workloadTotal)}">${person.workloadTotal}% (${formatWorkloadDuration(person.workloadTotal, person.working_hours)})</td>
          </tr>`;
          })
          .join('');

        const mobileCards = sorted
          .map((person) => {
            const isCurrentUser = viewerPersonId && String(person.id) === viewerPersonId;
            const cardClass = isCurrentUser
              ? 'ui-mobile-card ui-table-row-selected p-4'
              : 'ui-mobile-card p-4';
            return `<article class="${cardClass}" onclick="openPeopleOverviewModal(${person.id})">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <h4 class="ui-section-title text-base font-semibold break-words">${person.first_name} ${person.last_name}${personLeaverBadge(person)}</h4>
                  <p class="ui-text-muted mt-1 text-sm">${person.trade_name} · ${person.level_name}</p>
                </div>
                <div class="ui-section-title text-right text-sm font-semibold">${person.workloadTotal}%</div>
              </div>
              <dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div class="ui-stat-card px-3 py-2"><dt class="ui-text-muted text-[11px] font-semibold uppercase tracking-[0.16em]">${i18n.t('peopleOverview.columns.assignments')}</dt><dd class="mt-1 font-semibold ${assignmentsWarningClass(person.assignmentCount)}">${person.assignmentCount}</dd></div>
                <div class="ui-stat-card px-3 py-2"><dt class="ui-text-muted text-[11px] font-semibold uppercase tracking-[0.16em]">${i18n.t('peopleOverview.columns.workload')}</dt><dd class="mt-1 font-semibold ${workloadWarningClass(person.workloadTotal)}">${person.workloadTotal}% (${formatWorkloadDuration(person.workloadTotal, person.working_hours)})</dd></div>
                <div class="ui-stat-card px-3 py-2"><dt class="ui-text-muted text-[11px] font-semibold uppercase tracking-[0.16em]">${i18n.t('peopleOverview.columns.ownerships')}</dt><dd class="mt-1 font-semibold ${roleCountWarningClass(person.ownershipCount)}">${person.ownershipCount}</dd></div>
                <div class="ui-stat-card px-3 py-2"><dt class="ui-text-muted text-[11px] font-semibold uppercase tracking-[0.16em]">${i18n.t('peopleOverview.columns.leaderships')}</dt><dd class="mt-1 font-semibold ${roleCountWarningClass(person.leadershipCount)}">${person.leadershipCount}</dd></div>
              </dl>
              <div class="ui-text-secondary mt-3 text-xs">${i18n.t('peopleOverview.columns.contributions')}: <span class="font-semibold ${assignmentsWarningClass(person.contributionsCount)}">${person.contributionsCount}</span></div>
            </article>`;
          })
          .join('');

        return `<div class="ui-panel p-4">
          <div class="mb-3">
            <h3 class="text-lg font-semibold">${i18n.t('home.peopleOverview')}</h3>
            <p class="ui-section-subtitle text-xs">${i18n.t('peopleOverview.subtitle')}</p>
          </div>
          <div class="mb-3 flex items-center gap-2">
            <input
              type="search"
              id="people-overview-search-input"
              value="${state.peopleOverviewSearch || ''}"
              oninput="setPeopleOverviewSearch(this.value)"
              placeholder="${i18n.t('peopleOverview.searchPlaceholder')}"
              class="ui-input text-sm"
            />
            <button
              class="ui-btn ui-btn-secondary px-3 py-2 text-sm ${state.peopleOverviewSearch ? '' : 'opacity-50'}"
              onclick="clearPeopleOverviewSearch()"
              ${state.peopleOverviewSearch ? '' : 'disabled'}
              title="Clear search"
            >✕</button>
          </div>
          <div id="onboarding-people-overview-mobile-list" class="space-y-3 md:hidden">${mobileCards}</div>
          <div class="hidden md:block overflow-x-auto">
          <table id="onboarding-people-overview-table" class="w-full table-fixed text-left text-sm">
            <thead><tr class="ui-table-head">
              <th class="w-[20%] p-2"><button class="ui-sort-button inline-flex items-center gap-1 whitespace-nowrap" onclick="setPeopleOverviewSortField('name')">${i18n.t('people.columns.name')} ${state.peopleOverviewSort.startsWith('name_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[15%] p-2"><button class="ui-sort-button inline-flex items-center gap-1 whitespace-nowrap" onclick="setPeopleOverviewSortField('trade')">${i18n.t('people.columns.trade')} ${state.peopleOverviewSort.startsWith('trade_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[15%] p-2"><button class="ui-sort-button inline-flex items-center gap-1 whitespace-nowrap" onclick="setPeopleOverviewSortField('level')">${i18n.t('people.columns.level')} ${state.peopleOverviewSort.startsWith('level_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[9%] p-2"><button class="ui-sort-button inline-flex items-center gap-1 whitespace-nowrap" onclick="setPeopleOverviewSortField('assignments')">${i18n.t('peopleOverview.columns.assignments')} ${state.peopleOverviewSort.startsWith('assignments_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[9%] p-2"><button class="ui-sort-button inline-flex items-center gap-1 whitespace-nowrap" onclick="setPeopleOverviewSortField('ownerships')">${i18n.t('peopleOverview.columns.ownerships')} ${state.peopleOverviewSort.startsWith('ownerships_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[9%] p-2"><button class="ui-sort-button inline-flex items-center gap-1 whitespace-nowrap" onclick="setPeopleOverviewSortField('leaderships')">${i18n.t('peopleOverview.columns.leaderships')} ${state.peopleOverviewSort.startsWith('leaderships_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[9%] p-2"><button class="ui-sort-button inline-flex items-center gap-1 whitespace-nowrap" onclick="setPeopleOverviewSortField('contributions')">${i18n.t('peopleOverview.columns.contributions')} ${state.peopleOverviewSort.startsWith('contributions_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[14%] p-2"><button class="ui-sort-button inline-flex items-center gap-1 whitespace-nowrap" onclick="setPeopleOverviewSortField('quantity')">${i18n.t('peopleOverview.columns.workload')} ${state.peopleOverviewSort.startsWith('quantity_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          </div>
        </div>`;
      }

function clientsView() {
        return window.ProjectoryViews.renderClientsView({
          state,
          renderPriorityPill
        });
      }


      function administrationProjectsView() {
        return window.ProjectoryViews.renderAdministrationProjectsView({
          state
        });
      }

      function configurationView() {
        function renderColorSwatchGrid(kind, itemKey, selectedHex) {
          const normalizedSelected = String(selectedHex || '').toLowerCase();
          const swatches = CONFIGURATION_COLOR_OPTIONS.map((option) => {
            const hex = option.hex;
            const isSelected = normalizedSelected === hex.toLowerCase();
            const selectedClass = isSelected ? 'ui-color-swatch-ring-active' : 'ui-color-swatch-ring';
            const swatchStyle = option.style || `background:${hex};`;
            return `<button type="button" class="h-5 w-5 rounded-full ${selectedClass}" style="${swatchStyle}" data-config-action="pick-color" data-kind="${kind}" data-item-key="${itemKey}" data-color="${hex}" title="${hex}" aria-label="${i18n.t('admin.configuration.selectColorAria', { color: hex })}"></button>`;
          }).join('');
          return `<div class="grid grid-cols-4 gap-2">${swatches}</div>`;
        }

        function renderSelectedColorSwatch(kind, itemKey, colorHex, useMetallicSwatch = false) {
          const selected = String(colorHex || '#64748B');
          if (useMetallicSwatch) {
            const preset = getPriorityPresetFromHex(selected);
            if (preset !== 'custom' && PRIORITY_PRESET_MAP[preset]) {
              return `<button type="button" class="ui-color-swatch-ring inline-flex h-6 w-6 rounded-full" style="${PRIORITY_PRESET_MAP[preset].style}" data-config-action="open-color-modal" data-kind="${kind}" data-item-key="${itemKey}" data-selected-hex="${selected}" title="${preset}"></button>`;
            }
          }
          return `<button type="button" class="ui-color-swatch-ring inline-flex h-6 w-6 rounded-full" style="background:${selected};" data-config-action="open-color-modal" data-kind="${kind}" data-item-key="${itemKey}" data-selected-hex="${selected}" title="${selected}"></button>`;
        }

        function renderCard(kind, label, options = {}) {
          const items = state.configurationDraft[kind] || [];
          const supportsColor = Boolean(options.color);
          const supportsSort = Boolean(options.sort);
          const rows = [...items]
            .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name || '').localeCompare(String(b.name || '')))
            .map((item) => {
              const usage = Number(item.usage_count || 0);
              const usageClass = 'ui-btn-accent';
              const removeDisabled = usage > 0 ? 'disabled title="In use"' : '';
              const itemKey = item.id || item.key || item.name;
              const escapedItemKey = String(itemKey).replace(/"/g, '&quot;');
              const nameInput = `<input class="ui-input text-sm !p-1" data-config-action="set-name" data-kind="${kind}" data-item-key="${escapedItemKey}" value="${String(item.name || '').replace(/"/g, '&quot;')}" />`;
              const colorCell = supportsColor
                ? renderSelectedColorSwatch(kind, escapedItemKey, item.colorHex || '#64748B', kind === 'priorities')
                : '—';
              const dropHighlightClass = supportsSort && state.configurationDrag?.kind === kind && state.configurationDrag?.lastOverKey === String(itemKey)
                ? ' ui-drop-highlight'
                : '';
              const rowAttrs = supportsSort
                ? `class="ui-table-row ui-table-row-interactive${dropHighlightClass}" data-config-action="drag-drop-target" data-kind="${kind}" data-item-key="${escapedItemKey}"`
                : 'class="ui-table-row"';
              const handleCell = supportsSort
                ? `<button type="button" aria-label="Drag to reorder" class="ui-drag-handle cursor-grab active:cursor-grabbing rounded p-1" draggable="true" data-config-action="drag-handle" data-kind="${kind}" data-item-key="${escapedItemKey}"><span class="grid grid-cols-2 gap-0.5"><span class="h-1 w-1 rounded-full bg-current"></span><span class="h-1 w-1 rounded-full bg-current"></span><span class="h-1 w-1 rounded-full bg-current"></span><span class="h-1 w-1 rounded-full bg-current"></span><span class="h-1 w-1 rounded-full bg-current"></span><span class="h-1 w-1 rounded-full bg-current"></span></span></button>`
                : '';
              return `<tr ${rowAttrs}><td class="w-8 p-2 align-middle">${handleCell}</td><td class="ui-section-title p-2">${nameInput}</td><td class="p-2">${colorCell}</td><td class="p-2"><span class="ui-btn ${usageClass} px-2 py-0.5 text-xs">${usage}</span></td><td class="p-2 text-right"><button class="ui-btn ui-btn-danger px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40" data-config-action="remove-item" data-kind="${kind}" data-item-key="${escapedItemKey}" ${removeDisabled}>${i18n.t('common.delete')}</button></td></tr>`;
            })
            .join('');

          return `<div class="ui-panel-muted p-3"><div class="mb-3 flex items-center justify-between"><h4 class="ui-section-title text-sm font-semibold">${label}</h4><span class="ui-text-muted text-xs">${items.length} ${i18n.t('admin.configuration.items')}</span></div><div class="mb-3 flex gap-2"><input id="configuration-${kind}-new" class="ui-input text-sm" placeholder="${i18n.t('admin.configuration.addPlaceholder')}" /><button class="ui-btn ui-btn-secondary px-3 py-2 text-sm" data-config-action="add-item" data-kind="${kind}">${i18n.t('admin.configuration.add')}</button></div><div class="ui-table-shell max-h-72 overflow-y-auto"><table class="w-full text-left text-sm"><thead><tr class="ui-table-head"><th class="w-8 p-2"></th><th class="p-2">${i18n.t('admin.configuration.value')}</th><th class="p-2">${i18n.t('common.color')}</th><th class="p-2">${i18n.t('admin.configuration.usage')}</th><th class="p-2 text-right">${i18n.t('common.actions')}</th></tr></thead><tbody>${rows || `<tr><td class="ui-empty-state p-3" colspan="5">${i18n.t('admin.configuration.empty')}</td></tr>`}</tbody></table></div></div>`;
        }

        const colorPickerModal = state.configurationColorPicker?.open
          ? `<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/60" data-config-action="color-modal-overlay"><div class="ui-modal-shell w-full max-w-xs p-4 shadow-2xl"><div class="mb-3 flex items-center justify-between"><h4 class="ui-section-title text-sm font-semibold">${i18n.t('admin.configuration.selectColor')}</h4><button type="button" class="ui-btn ui-btn-secondary px-2 py-1 text-xs" data-config-action="close-color-modal">${i18n.t('common.close')}</button></div>${renderColorSwatchGrid(state.configurationColorPicker.kind, state.configurationColorPicker.itemKey, state.configurationColorPicker.selectedHex)}</div></div>`
          : '';

        return `<div class="ui-panel p-4 space-y-4"><div><h3 class="text-lg font-semibold">${i18n.t('admin.configuration.title')}</h3><p class="ui-section-subtitle text-sm">${i18n.t('admin.configuration.subtitle')}</p></div><div class="grid gap-4 md:grid-cols-2">${renderCard('trades', i18n.t('configuration.trades'))}${renderCard('levels', i18n.t('configuration.levels'), { sort: true })}${renderCard('priorities', i18n.t('configuration.priorities'), { color: true, sort: true })}${renderCard('projectStatuses', i18n.t('configuration.projectStatuses'), { color: true, sort: true })}</div>${colorPickerModal}</div>`;
      }

      window.addConfigurationItem = addConfigurationItem;
      window.removeConfigurationItem = removeConfigurationItem;
      window.updateConfigurationItemField = updateConfigurationItemField;
      window.updateConfigurationPriorityPreset = updateConfigurationPriorityPreset;
      window.dragConfigurationRowStart = dragConfigurationRowStart;
      window.dragConfigurationRowOver = dragConfigurationRowOver;
      window.dropConfigurationRow = dropConfigurationRow;
      bindConfigurationPanelEvents();

      function accessManagementView() {
        const adminUserIds = (state.adminUsers || [])
          .filter((entry) => (entry.roles || []).map((role) => String(role).toLowerCase()).includes('admin'))
          .map((entry) => Number(entry.id))
          .filter((id) => Number.isInteger(id) && id > 0);
        const adminCount = adminUserIds.length;
        const bootstrapAdminId = adminUserIds.length ? Math.min(...adminUserIds) : null;
        const userRows = (state.adminUsers || []).map((user) => {
          const statusLabel = String(user.status || 'unknown').replace(/_/g, ' ');
          const inviteMeta = user.latestInvitedAt ? `<div class="ui-help-text text-[11px]">${i18n.t('admin.access.messages.invitedAt', { timestamp: user.latestInvitedAt })}</div>` : '';
          const userRoles = (user.roles || []).map((role) => String(role).toLowerCase());
          const isBootstrapAdmin = userRoles.includes('admin') && Number(user.id) === bootstrapAdminId;
          const inviteButton = isBootstrapAdmin
            ? ''
            : `<button class="ui-btn ui-btn-success px-2 py-1 text-xs" onclick="inviteAdminUserFromAccessTab(${Number(user.id)})">${i18n.t('admin.access.actions.invite')}</button>`;
          const revokeButton = user.canRevokeInvite && !isBootstrapAdmin ? `<button class="ui-btn ui-btn-secondary px-2 py-1 text-xs" onclick="revokeInviteFromAccessTab(${Number(user.id)})">${i18n.t('admin.access.actions.revokeInvite')}</button>` : '';
          const deleteDisabled = adminCount < 2;
          const deleteButton = deleteDisabled
            ? `<button class="ui-btn ui-btn-danger px-2 py-1 text-xs cursor-not-allowed opacity-40" disabled title="${i18n.t('admin.access.messages.requireSecondAdmin')}">${i18n.t('common.delete')}</button>`
            : `<button class="ui-btn ui-btn-danger px-2 py-1 text-xs" onclick="deleteAdminUserFromAccessTab(${Number(user.id)})">${i18n.t('common.delete')}</button>`;
          return `<tr class="ui-table-row"><td class="p-2">${user.displayName}</td><td class="ui-text-secondary p-2">${user.email}</td><td class="ui-text-secondary p-2">${(user.roles || []).join(', ') || '—'}</td><td class="ui-text-secondary p-2">${user.personName || '—'}</td><td class="ui-text-secondary p-2"><div class="capitalize">${statusLabel}</div>${inviteMeta}</td><td class="p-2 text-right"><div class="flex flex-wrap justify-end gap-2"><button class="ui-btn ui-btn-secondary px-2 py-1 text-xs" onclick="openAdminUserEditModal(${Number(user.id)})">${i18n.t('common.edit')}</button>${inviteButton}${revokeButton}${deleteButton}</div></td></tr>`;
        }).join('');
        const auditRows = (state.auditEntries || []).slice(0, 20).map((entry) => `<tr class="ui-table-row"><td class="ui-text-secondary p-2 text-xs">${entry.created_at || ''}</td><td class="p-2 text-xs">${entry.action || ''}</td><td class="ui-text-secondary p-2 text-xs">${entry.actor_role || '—'}</td><td class="ui-text-secondary p-2 text-xs">${entry.entity_type || '—'} ${entry.entity_id || ''}</td></tr>`).join('');
        const smtp = state.smtpSettings || {};
        const personOptions = (state.people || [])
          .map((person) => ({
            id: Number(person.id),
            name: `${String(person.first_name || '').trim()} ${String(person.last_name || '').trim()}`.trim()
          }))
          .filter((person) => Number.isInteger(person.id) && person.id > 0 && person.name)
          .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
        const personOptionsHtml = personOptions
          .map((person) => `<option value="${person.name.replace(/"/g, '&quot;')}"></option>`)
          .join('');

        return `<div class="space-y-4">
          <div class="ui-panel p-4">
            <h3 class="mb-3 text-lg font-semibold">${i18n.t('admin.access.title')}</h3>
            <div class="mb-3 grid gap-3 md:grid-cols-5">
              <label class="ui-label text-xs">${i18n.t('admin.access.fields.displayName')}
                <input id="access-user-name" class="ui-input mt-1 text-sm" placeholder="${i18n.t('admin.access.fields.displayName')}" />
              </label>
              <label class="ui-label text-xs">${i18n.t('admin.access.fields.email')}
                <input id="access-user-email" class="ui-input mt-1 text-sm" placeholder="${i18n.t('admin.access.fields.email')}" />
              </label>
              <label class="ui-label text-xs">${i18n.t('admin.access.fields.role')}
                <select id="access-user-role" class="ui-select mt-1 text-sm">
                  <option value="viewer">${i18n.t('admin.access.roles.viewer')}</option>
                  <option value="planner">${i18n.t('admin.access.roles.planner')}</option>
                  <option value="teammate">${i18n.t('admin.access.roles.teammate')}</option>
                  <option value="admin">${i18n.t('admin.access.roles.admin')}</option>
                </select>
              </label>
              <label class="ui-label text-xs md:col-span-2">${i18n.t('admin.access.fields.person')}
                <input id="access-user-person" list="access-user-person-options" class="ui-input mt-1 text-sm" placeholder="${i18n.t('admin.access.fields.personPlaceholder')}" />
                <datalist id="access-user-person-options">${personOptionsHtml}</datalist>
                <span class="ui-help-text mt-1 block text-[11px]">${i18n.t('admin.access.fields.personHelp')}</span>
              </label>
              <button class="ui-btn ui-btn-accent px-3 py-2 text-sm md:col-start-5" onclick="createAdminUserFromAccessTab()">${i18n.t('admin.access.actions.createUser')}</button>
            </div>
            <div class="ui-table-shell overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr class="ui-table-head"><th class="p-2">${i18n.t('admin.access.table.name')}</th><th class="p-2">${i18n.t('admin.access.table.email')}</th><th class="p-2">${i18n.t('admin.access.table.roles')}</th><th class="p-2">${i18n.t('admin.access.table.person')}</th><th class="p-2">${i18n.t('common.status')}</th><th class="p-2 text-right">${i18n.t('common.actions')}</th></tr></thead><tbody>${userRows || `<tr><td class="ui-empty-state p-3" colspan="6">${i18n.t('admin.access.table.empty')}</td></tr>`}</tbody></table></div>
          </div>

          <div class="ui-panel p-4">
            <h3 class="mb-3 text-lg font-semibold">${i18n.t('admin.smtp.title')}</h3>
            <div class="grid gap-3 md:grid-cols-3">
              <label class="ui-label text-xs">${i18n.t('admin.smtp.fields.host')}
                <input id="smtp-host" class="ui-input mt-1 text-sm" placeholder="${i18n.t('admin.smtp.placeholders.host')}" value="${smtp.host || ''}" />
              </label>
              <label class="ui-label text-xs">${i18n.t('admin.smtp.fields.port')}
                <input id="smtp-port" class="ui-input mt-1 text-sm" placeholder="${i18n.t('admin.smtp.placeholders.port')}" value="${smtp.port || ''}" />
              </label>
              <label class="ui-label text-xs">${i18n.t('admin.smtp.fields.username')}
                <input id="smtp-user" class="ui-input mt-1 text-sm" placeholder="${i18n.t('admin.smtp.placeholders.username')}" value="${smtp.username || ''}" />
              </label>
              <label class="ui-label text-xs md:col-span-2">${i18n.t('admin.smtp.fields.fromEmail')}
                <input id="smtp-from" class="ui-input mt-1 text-sm" placeholder="${i18n.t('admin.smtp.placeholders.fromEmail')}" value="${smtp.fromEmail || ''}" />
              </label>
              <label class="ui-label text-xs">${i18n.t('admin.smtp.fields.password')}
                <input id="smtp-password" type="password" class="ui-input mt-1 text-sm" placeholder="${smtp.passwordSet ? i18n.t('admin.smtp.placeholders.passwordSet') : i18n.t('admin.smtp.placeholders.password')}" />
              </label>
              <label class="inline-flex items-center gap-2 self-end text-sm"><input id="smtp-enabled" type="checkbox" ${smtp.enabled ? 'checked' : ''} /> ${i18n.t('admin.smtp.fields.enabled')}</label>
              <label class="inline-flex items-center gap-2 self-end text-sm"><input id="smtp-secure" type="checkbox" ${smtp.secure !== false ? 'checked' : ''} /> ${i18n.t('admin.smtp.fields.secure')}</label>
              <button class="ui-btn ui-btn-accent px-3 py-2 text-sm" onclick="saveSmtpSettingsFromAccessTab()">${i18n.t('admin.smtp.actions.save')}</button>
              <label class="ui-label text-xs md:col-span-2">${i18n.t('admin.smtp.fields.testRecipient')}
                <input id="smtp-test-to" class="ui-input mt-1 text-sm" placeholder="${i18n.t('admin.smtp.placeholders.testRecipient')}" value="${state.smtpTestRecipient || smtp.fromEmail || ''}" />
              </label>
              <button class="ui-btn ui-btn-success px-3 py-2 text-sm" onclick="sendSmtpTestMailFromAccessTab()">${i18n.t('admin.smtp.actions.sendTest')}</button>
            </div>
          </div>

          <div class="ui-panel p-4">
            <div class="mb-3 flex items-center justify-between"><h3 class="text-lg font-semibold">${i18n.t('admin.audit.title')}</h3><button class="ui-btn ui-btn-secondary px-3 py-1 text-sm" onclick="refreshAuditFromAccessTab()">${i18n.t('admin.audit.refresh')}</button></div>
            <div class="ui-table-shell max-h-80 overflow-y-auto"><table class="w-full text-left text-sm"><thead><tr class="ui-table-head"><th class="p-2">${i18n.t('admin.audit.columns.timestamp')}</th><th class="p-2">${i18n.t('admin.audit.columns.action')}</th><th class="p-2">${i18n.t('admin.audit.columns.role')}</th><th class="p-2">${i18n.t('admin.audit.columns.entity')}</th></tr></thead><tbody>${auditRows || `<tr><td class="ui-empty-state p-3" colspan="4">${i18n.t('admin.audit.empty')}</td></tr>`}</tbody></table></div>
          </div>
        </div>`;
      }

      window.createAdminUserFromAccessTab = async function createAdminUserFromAccessTab() {
        try {
          const displayName = String(document.getElementById('access-user-name')?.value || '').trim();
          const email = String(document.getElementById('access-user-email')?.value || '').trim();
          const role = String(document.getElementById('access-user-role')?.value || 'viewer').trim().toLowerCase();
          const personRaw = String(document.getElementById('access-user-person')?.value || '').trim();

          let personId = null;
          if (personRaw) {
            if (/^\d+$/.test(personRaw)) {
              personId = Number(personRaw);
            } else {
              const normalized = personRaw.toLowerCase();
              const matches = (state.people || []).filter((person) => {
                const name = `${String(person.first_name || '').trim()} ${String(person.last_name || '').trim()}`.trim().toLowerCase();
                return name === normalized;
              });
              if (matches.length === 1) {
                personId = Number(matches[0].id);
              } else {
                showMessage(i18n.t('admin.access.messages.personNotFound'), 'error');
                return;
              }
            }
          }

          await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ displayName, email, role, personId }) });
          await loadAdminAccessData();
          render();
          showMessage(i18n.t('admin.access.messages.userCreated'));
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };


      window.openAdminUserEditModal = function openAdminUserEditModal(userId) {
        const user = (state.adminUsers || []).find((entry) => Number(entry.id) === Number(userId));
        const modal = document.getElementById('admin-user-modal');
        if (!user || !modal) {
          showMessage(i18n.t('admin.access.messages.userNotFound'), 'error');
          return;
        }

        const personSelect = document.getElementById('admin-user-edit-person');
        if (personSelect) {
          const options = (state.people || [])
            .map((person) => ({
              id: Number(person.id),
              name: `${String(person.first_name || '').trim()} ${String(person.last_name || '').trim()}`.trim()
            }))
            .filter((person) => Number.isInteger(person.id) && person.id > 0 && person.name)
            .sort((a, b) => a.name.localeCompare(b.name));
          const safeDom = window.ProjectorySafeDom || {};
          if (typeof safeDom.clearChildren === 'function') {
            safeDom.clearChildren(personSelect);
          } else {
            personSelect.textContent = '';
          }

          if (typeof safeDom.appendOption === 'function') {
            safeDom.appendOption(personSelect, '', i18n.t('admin.access.fields.unlinked'), false);
            options.forEach((person) => safeDom.appendOption(personSelect, person.id, person.name, false));
          } else {
            const unlinkedOption = document.createElement('option');
            unlinkedOption.value = '';
            unlinkedOption.textContent = i18n.t('admin.access.fields.unlinked');
            personSelect.appendChild(unlinkedOption);
            options.forEach((person) => {
              const option = document.createElement('option');
              option.value = String(person.id);
              option.textContent = String(person.name || '');
              personSelect.appendChild(option);
            });
          }
        }

        document.getElementById('admin-user-edit-id').value = String(user.id);
        document.getElementById('admin-user-edit-name').value = String(user.displayName || '');
        document.getElementById('admin-user-edit-email').value = String(user.email || '');
        const roleSelect = document.getElementById('admin-user-edit-role');
        const personSelectForEdit = document.getElementById('admin-user-edit-person');
        const userIsAdmin = (user.roles || []).map((role) => String(role).toLowerCase()).includes('admin');
        const adminCount = (state.adminUsers || []).filter((entry) => (entry.roles || []).map((role) => String(role).toLowerCase()).includes('admin')).length;
        const singleAdminMode = adminCount <= 1;

        if (roleSelect) {
          roleSelect.value = String((user.roles || [])[0] || 'viewer').toLowerCase();
          roleSelect.disabled = singleAdminMode;
          roleSelect.title = singleAdminMode ? i18n.t('admin.access.messages.roleEditRequiresMultipleAdmins') : '';
          if (!singleAdminMode && userIsAdmin) {
            const demoteDisabled = adminCount <= 1;
            roleSelect.querySelectorAll('option').forEach((option) => {
              const nextRole = String(option.value || '').toLowerCase();
              option.disabled = demoteDisabled && nextRole !== 'admin';
            });
          } else {
            roleSelect.querySelectorAll('option').forEach((option) => { option.disabled = false; });
          }
        }

        document.getElementById('admin-user-edit-person').value = user.personId ? String(user.personId) : '';
        if (personSelectForEdit) {
          personSelectForEdit.disabled = false;
          personSelectForEdit.title = '';
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
      };

      window.closeAdminUserEditModal = function closeAdminUserEditModal() {
        const modal = document.getElementById('admin-user-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      };

      window.updateAdminUserFromAccessTab = async function updateAdminUserFromAccessTab(event) {
        event?.preventDefault();
        try {
          const id = Number(document.getElementById('admin-user-edit-id')?.value || 0);
          const displayName = String(document.getElementById('admin-user-edit-name')?.value || '').trim();
          const email = String(document.getElementById('admin-user-edit-email')?.value || '').trim();
          const roleElement = document.getElementById('admin-user-edit-role');
          const personElement = document.getElementById('admin-user-edit-person');
          const roleInput = String(roleElement?.value || 'viewer').trim().toLowerCase();
          const personValue = String(personElement?.value || '').trim();

          await api(`/api/admin/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              displayName,
              email,
              role: roleElement?.disabled ? undefined : roleInput,
              personId: personElement?.disabled ? undefined : (personValue ? Number(personValue) : null),
              isActive: true
            })
          });

          await loadAdminAccessData();
          closeAdminUserEditModal();
          render();
          showMessage(i18n.t('admin.access.messages.userUpdated'));
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };

      function bindAdminUserModalActions() {
        document.getElementById('admin-user-modal-close')?.addEventListener('click', window.closeAdminUserEditModal);
        document.getElementById('admin-user-modal-cancel')?.addEventListener('click', window.closeAdminUserEditModal);
        document.getElementById('admin-user-edit-form')?.addEventListener('submit', window.updateAdminUserFromAccessTab);
      }


      window.deleteAdminUserFromAccessTab = async function deleteAdminUserFromAccessTab(userId) {
        try {
          const user = (state.adminUsers || []).find((entry) => Number(entry.id) === Number(userId));
          if (!user) return;
          const adminCount = (state.adminUsers || []).filter((entry) => (entry.roles || []).map((role) => String(role).toLowerCase()).includes('admin')).length;
          if (adminCount < 2) {
            showMessage(i18n.t('admin.access.messages.requireSecondAdmin'), 'error');
            return;
          }
          if (!window.confirm(i18n.t('admin.access.messages.confirmDeleteUser', { name: user.displayName, email: user.email }))) return;

          await api(`/api/admin/users/${Number(userId)}`, { method: 'DELETE' });
          await loadAdminAccessData();
          render();
          showMessage(i18n.t('admin.access.messages.userDeleted'));
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };

      window.inviteAdminUserFromAccessTab = async function inviteAdminUserFromAccessTab(userId) {
        try {
          await api(`/api/admin/users/${Number(userId)}/invite`, {
            method: 'POST',
            body: JSON.stringify({ expiresHours: 72 })
          });
          await loadAdminAccessData();
          render();
          showMessage(i18n.t('admin.access.messages.inviteSent'));
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };



      window.revokeInviteFromAccessTab = async function revokeInviteFromAccessTab(userId) {
        try {
          await api(`/api/admin/users/${Number(userId)}/invite/revoke`, { method: 'POST' });
          await loadAdminAccessData();
          render();
          showMessage(i18n.t('admin.access.messages.inviteRevoked'));
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };

      window.saveSmtpSettingsFromAccessTab = async function saveSmtpSettingsFromAccessTab() {
        try {
          state.smtpTestRecipient = String(document.getElementById('smtp-test-to')?.value || '').trim();

          const payload = {
            host: String(document.getElementById('smtp-host')?.value || '').trim(),
            port: Number(document.getElementById('smtp-port')?.value || 0),
            username: String(document.getElementById('smtp-user')?.value || '').trim(),
            fromEmail: String(document.getElementById('smtp-from')?.value || '').trim(),
            password: String(document.getElementById('smtp-password')?.value || '').trim() || null,
            enabled: Boolean(document.getElementById('smtp-enabled')?.checked),
            secure: Boolean(document.getElementById('smtp-secure')?.checked)
          };
          state.smtpSettings = await api('/api/admin/smtp-settings', { method: 'PUT', body: JSON.stringify(payload) });
          render();
          showMessage(i18n.t('admin.smtp.messages.saved'));
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };

      window.sendSmtpTestMailFromAccessTab = async function sendSmtpTestMailFromAccessTab() {
        try {
          const toEmail = String(document.getElementById('smtp-test-to')?.value || '').trim();
          state.smtpTestRecipient = toEmail;
          if (!toEmail) {
            showMessage(i18n.t('admin.smtp.messages.testRecipientRequired'), 'error');
            return;
          }

          await api('/api/admin/smtp-settings/test-email', {
            method: 'POST',
            body: JSON.stringify({ toEmail })
          });
          showMessage(i18n.t('admin.smtp.messages.testSent', { toEmail }));
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };

      window.refreshAuditFromAccessTab = async function refreshAuditFromAccessTab() {
        try {
          const audit = await api('/api/admin/audit?limit=100');
          state.auditEntries = Array.isArray(audit?.entries) ? audit.entries : [];
          render();
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };
