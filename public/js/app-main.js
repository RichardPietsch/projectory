      const state = window.ProjectoryState.createInitialState();
      const i18n = window.ProjectoryI18n;
      const onboardingTour = window.ProjectoryOnboardingTour;

      const adminTabs = [
        { id: 'people', labelKey: 'admin.tabs.people' },
        { id: 'clients', labelKey: 'admin.tabs.clients' },
        { id: 'projects', labelKey: 'admin.tabs.projects' },
        { id: 'configuration', labelKey: 'admin.tabs.configuration' },
        { id: 'access', labelKey: 'admin.tabs.access' }
      ];

      const CHALLENGE_TITLE_PREFILL = 'Placeholder Challenge';
      const CHALLENGE_DESCRIPTION_PREFILL = 'Please edit this to reflect an actual challenge!';

      const onboardingDemo = {
        open: false,
        stepIndex: 0,
        listenersBound: false,
        highlightedElement: null,
        steps: [
          {
            id: 'welcome',
            target: '#app-logo-button',
            titleKey: 'onboarding.demo.step1.title',
            descriptionKey: 'onboarding.demo.step1.description',
            onEnter: () => {
              state.showAdmin = false;
              state.homeTab = 'client-teams';
              state.selectedProjectId = '';
              navigateFromState();
              render();
            }
          },
          {
            id: 'project-overview',
            target: '#onboarding-project-overview-table',
            titleKey: 'onboarding.demo.step2.title',
            descriptionKey: 'onboarding.demo.step2.description',
            onEnter: () => {
              state.showAdmin = false;
              state.homeTab = 'client-teams';
              state.selectedProjectId = '';
              navigateFromState();
              render();
            }
          },
          {
            id: 'challenge-overview',
            target: '#onboarding-challenge-overview',
            titleKey: 'onboarding.demo.step3.title',
            descriptionKey: 'onboarding.demo.step3.description',
            onEnter: () => {
              state.showAdmin = false;
              state.homeTab = 'client-teams';
              const hasProject52 = state.projectsPayload.projects.some((project) => Number(project.id) === 52);
              state.selectedProjectId = hasProject52 ? '52' : String(state.projectsPayload.projects[0]?.id || '');
              navigateFromState();
              render();
            }
          },
          {
            id: 'add-challenge',
            target: '#onboarding-add-challenge',
            titleKey: 'onboarding.demo.step4.title',
            descriptionKey: 'onboarding.demo.step4.description'
          },
          {
            id: 'project-team-overview',
            target: '#onboarding-project-team-overview',
            titleKey: 'onboarding.demo.step5.title',
            descriptionKey: 'onboarding.demo.step5.description'
          },
          {
            id: 'client-owners',
            target: '#onboarding-client-owners',
            titleKey: 'onboarding.demo.step6.title',
            descriptionKey: 'onboarding.demo.step6.description'
          },
          {
            id: 'client-leaders',
            target: '#onboarding-client-leaders',
            titleKey: 'onboarding.demo.step7.title',
            descriptionKey: 'onboarding.demo.step7.description'
          },
          {
            id: 'contributors',
            target: '#onboarding-contributors',
            titleKey: 'onboarding.demo.step8.title',
            descriptionKey: 'onboarding.demo.step8.description'
          },
          {
            id: 'people-overview',
            target: '#onboarding-people-overview-table',
            titleKey: 'onboarding.demo.step9.title',
            descriptionKey: 'onboarding.demo.step9.description',
            onEnter: () => {
              state.showAdmin = false;
              state.homeTab = 'people-overview';
              state.selectedProjectId = '';
              navigateFromState();
              render();
            }
          },
          {
            id: 'wrap-up',
            target: null,
            titleKey: 'onboarding.demo.step10.title',
            descriptionKey: 'onboarding.demo.step10.description',
            onEnter: () => {
              state.showAdmin = false;
              state.homeTab = 'client-teams';
              state.selectedProjectId = '';
              navigateFromState();
              render();
            }
          }
        ]
      };



      function splitInlineArgs(argsString) {
        const args = [];
        let current = '';
        let depth = 0;
        let quote = '';
        let escape = false;

        for (const char of String(argsString || '')) {
          if (escape) {
            current += char;
            escape = false;
            continue;
          }

          if (char === '\\') {
            current += char;
            escape = true;
            continue;
          }

          if (quote) {
            current += char;
            if (char === quote) quote = '';
            continue;
          }

          if (char === '"' || char === "'") {
            quote = char;
            current += char;
            continue;
          }

          if (char === '(' || char === '[' || char === '{') {
            depth += 1;
            current += char;
            continue;
          }

          if (char === ')' || char === ']' || char === '}') {
            depth = Math.max(0, depth - 1);
            current += char;
            continue;
          }

          if (char === ',' && depth === 0) {
            args.push(current.trim());
            current = '';
            continue;
          }

          current += char;
        }

        if (current.trim()) args.push(current.trim());
        return args;
      }

      function parseInlineArg(token, element, event) {
        const value = String(token || '').trim();
        if (!value) return undefined;
        if (value === 'event') return event;
        if (value === 'this') return element;
        if (value === 'this.value') return element?.value;
        if (value === 'this.checked') return Boolean(element?.checked);
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (value === 'null') return null;
        if (value === 'undefined') return undefined;
        if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          if (value.startsWith('"')) {
            try {
              return JSON.parse(value);
            } catch (_error) {
              return value.slice(1, -1);
            }
          }

          return value.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        }

        if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
          try {
            return JSON.parse(value);
          } catch (_error) {
            return value;
          }
        }

        return value;
      }

      function resolveInlineFunction(functionPath) {
        return String(functionPath || '')
          .split('.')
          .filter(Boolean)
          .reduce((ref, key) => (ref ? ref[key] : undefined), window);
      }

      function bindInlineHandlers(root = document) {
        const events = ['onclick', 'oninput', 'onchange', 'onsubmit'];
        for (const attr of events) {
          root.querySelectorAll(`[${attr}]`).forEach((element) => {
            const marker = `inlineBound${attr}`;
            if (element.dataset[marker]) return;

            const expression = String(element.getAttribute(attr) || '').trim();
            if (!expression) return;

            const match = expression.match(/^([A-Za-z_$][\w$.]*)\((.*)\)$/s);
            if (!match) return;

            const functionName = match[1];
            const argTokens = splitInlineArgs(match[2]);
            const eventName = attr.slice(2);

            element.addEventListener(eventName, (event) => {
              const targetFn = resolveInlineFunction(functionName);
              if (typeof targetFn !== 'function') return;
              const args = argTokens.map((token) => parseInlineArg(token, element, event));
              targetFn(...args);
              if (eventName === 'submit') event.preventDefault();
            });

            element.dataset[marker] = '1';
            element.removeAttribute(attr);
          });
        }
      }

      function showMessage(message, type = 'ok', options = {}) {
        const { actionLabel, onAction } = options;
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `pointer-events-auto rounded-md border px-3 py-2 text-sm shadow-lg transition duration-300 ${
          type === 'error'
            ? 'border-rose-500/50 bg-rose-500/10 text-rose-200'
            : type === 'warning'
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
              : 'border-[#00d8ff]/50 bg-[#00d8ff]/10 text-[#7cecff]'
        }`;
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-4px)';
        const text = document.createElement('span');
        text.textContent = message;
        toast.appendChild(text);

        if (actionLabel && typeof onAction === 'function') {
          toast.classList.add('flex', 'items-center', 'justify-between', 'gap-2');

          const actionButton = document.createElement('button');
          actionButton.type = 'button';
          actionButton.className = 'rounded border border-current/40 px-2 py-1 text-xs font-semibold hover:bg-slate-900/60';
          actionButton.textContent = actionLabel;
          actionButton.addEventListener('click', async () => {
            actionButton.disabled = true;
            await onAction();
            toast.remove();
          });
          toast.appendChild(actionButton);
        }

        container.appendChild(toast);
        requestAnimationFrame(() => {
          toast.style.opacity = '1';
          toast.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(-4px)';
          setTimeout(() => toast.remove(), 300);
        }, 3500);
      }

      function formatEuro(cents) {
        return (Number(cents || 0) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
      }

      function formatEuroWhole(cents) {
        return (Number(cents || 0) / 100).toLocaleString('de-DE', {
          style: 'currency',
          currency: 'EUR',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        });
      }

      function getProjectStatusPresentation(status) {
        const normalized = String(status || 'in_progress').toLowerCase();
        const configured = (state.meta.projectStatuses || []).find((item) => String(item.key) === normalized);
        if (configured) {
          return { key: configured.key, rank: Number(configured.sortOrder || 999), label: configured.label || configured.key, colorHex: configured.colorHex || '#64748B' };
        }
        const legacyMap = { green: { key: 'done', rank: 1, label: 'Done', colorHex: '#22C55E' }, yellow: { key: 'in_progress', rank: 2, label: 'In Progress', colorHex: '#EAB308' }, blue: { key: 'in_progress', rank: 2, label: 'In Progress', colorHex: '#EAB308' }, red: { key: 'rework_needed', rank: 3, label: 'Rework needed', colorHex: '#EF4444' }, white: { key: 'in_progress', rank: 2, label: 'In Progress', colorHex: '#EAB308' } };
        return legacyMap[normalized] || { key: normalized, rank: 999, label: normalized, colorHex: '#64748B' };
      }

      function renderProjectStatusPill(status, projectId = null) {
        const presentation = getProjectStatusPresentation(status);
        const canOpenStatus = projectId && !isViewerMode();
        const clickAttr = canOpenStatus ? ` onclick="openProjectStatusPicker(${projectId}, event)"` : '';
        const interactiveClass = canOpenStatus ? ' cursor-pointer hover:scale-110' : '';
        return `<span class="inline-flex h-3 w-3 rounded-full border border-white/40${interactiveClass}" style="background:${presentation.colorHex};" title="${presentation.label}" aria-label="${presentation.label}"${clickAttr}></span>`;
      }


      const PRIORITY_PRESET_MAP = {
        gold: {
          hex: '#FFD700',
          textClass: 'text-slate-900',
          style: 'background: linear-gradient(145deg, rgba(250, 231, 135, 1) 0%, rgba(255, 162, 0, 1) 48%, rgba(255, 182, 87, 1) 49%, rgba(255, 237, 145, 1) 77%, rgba(255, 246, 219, 1) 78%, rgba(255, 175, 15, 1) 100%);'
        },
        silver: {
          hex: '#C0C0C0',
          textClass: 'text-slate-900',
          style: 'background: linear-gradient(145deg, rgba(213, 225, 235, 1) 0%, rgba(224, 224, 224, 1) 47%, rgba(242, 242, 242, 1) 49%, rgba(225, 230, 230, 1) 77%, rgba(255, 255, 255, 1) 78%, rgba(227, 227, 227, 1) 100%);'
        },
        bronze: {
          hex: '#CD7F32',
          textClass: 'text-slate-900',
          style: 'background: linear-gradient(145deg, rgba(199, 162, 111, 1) 0%, rgba(230, 214, 188, 1) 47%, rgba(242, 228, 201, 1) 49%, rgba(247, 214, 148, 1) 77%, rgba(247, 231, 178, 1) 78%, rgba(245, 219, 174, 1) 100%);'
        },
        black: {
          hex: '#111111',
          textClass: 'text-slate-100',
          style: 'background: linear-gradient(145deg, rgba(17, 17, 17, 1) 0%, rgba(31, 41, 55, 1) 60%, rgba(17, 24, 39, 1) 100%);'
        }
      };
      const CONFIGURATION_SORTABLE_KINDS = new Set(['levels', 'priorities', 'projectStatuses']);

      function getPriorityPresetFromHex(colorHex) {
        const normalizedHex = String(colorHex || '').trim().toLowerCase();
        for (const [preset, config] of Object.entries(PRIORITY_PRESET_MAP)) {
          if (normalizedHex === String(config.hex || '').toLowerCase()) {
            return preset;
          }
        }
        return 'custom';
      }

      function isConfigurationKindSortable(kind) {
        return CONFIGURATION_SORTABLE_KINDS.has(kind);
      }

      function normalizeConfigurationSortOrder(list, kind) {
        if (!isConfigurationKindSortable(kind)) return [...list];
        return list.map((item, index) => ({ ...item, sortOrder: index + 1 }));
      }

      function getPriorityPresentation(priorityName, colorHex = '#64748B') {
        const normalized = String(priorityName || '').trim() || 'Unknown';
        const preset = getPriorityPresetFromHex(colorHex);
        const presetConfig = PRIORITY_PRESET_MAP[preset];
        return {
          rank: 99,
          label: normalized,
          colorHex: String(colorHex || '#64748B'),
          textClass: presetConfig?.textClass || 'text-white',
          style: presetConfig?.style || `background:${String(colorHex || '#64748B')};`
        };
      }

      function renderPriorityPill(priorityName, colorHex = '#64748B') {
        const priority = getPriorityPresentation(priorityName, colorHex);
        return `<span class="inline-flex items-center gap-1 rounded-full border border-white/30 px-2 py-1 text-xs font-semibold ${priority.textClass}" style="${priority.style}"><span>${priority.label}</span></span>`;
      }

      const { api } = window.ProjectoryApi;

      function currentRole() {
        return String(state.auth?.role || 'admin').toLowerCase();
      }

      function isViewerMode() {
        return currentRole() === 'viewer';
      }

      function canAccessAdmin() {
        return currentRole() === 'admin';
      }

      function canViewPeopleOverview() {
        return ['viewer', 'planner', 'admin'].includes(currentRole());
      }

      function isTeammateMode() {
        return currentRole() === 'teammate';
      }

      function currentPersonId() {
        const personId = state.auth?.personId;
        return personId === null || personId === undefined || personId === '' ? '' : String(personId);
      }

      function selfRoleIcon(isSelf) {
        return isSelf ? '<span class="iconify" data-icon="mdi:account-circle" aria-hidden="true"></span>' : '';
      }

      function needsLoginScreen() {
        return Boolean(state.authRequired);
      }

      function loginScreenView() {
        const forgotBusy = state.forgotPassword.submitting ? i18n.t('auth.forgot.submitBusy') : i18n.t('auth.forgot.submit');
        const forgotError = state.forgotPassword.error ? `<p class="mt-2 text-xs text-rose-300">${state.forgotPassword.error}</p>` : '';
        const forgotSuccess = state.forgotPassword.submitted
          ? `<p class="mt-2 text-xs text-emerald-300">${i18n.t('auth.forgot.success')}</p>`
          : '';

        return `<div class="mx-auto mt-8 max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
          <div class="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <h2 class="text-3xl font-bold">${i18n.t('auth.login.title')}</h2>
              <p class="mt-2 text-slate-300">${i18n.t('auth.login.subtitle')}</p>
              <ul class="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-400">
                <li>${i18n.t('auth.login.bullet.permissions')}</li>
                <li>${i18n.t('auth.login.bullet.session')}</li>
                <li>${i18n.t('auth.login.bullet.audit')}</li>
              </ul>
            </div>
            <div class="space-y-4">
              <form id="login-form" class="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <h3 class="mb-3 text-lg font-semibold">${i18n.t('auth.login.formTitle')}</h3>
                <label class="mb-2 block text-sm text-slate-300">${i18n.t('auth.login.email')}
                  <input id="login-email" type="email" class="mt-1 w-full rounded bg-slate-950 p-2" placeholder="${i18n.t('auth.login.placeholders.email')}" required />
                </label>
                <label class="mb-3 block text-sm text-slate-300">${i18n.t('auth.login.password')}
                  <input id="login-password" type="password" class="mt-1 w-full rounded bg-slate-950 p-2" placeholder="${i18n.t('auth.login.placeholders.password')}" required />
                </label>
                <div class="flex gap-2">
                  <button type="submit" class="rounded bg-[#00d8ff] px-3 py-2 text-sm font-semibold text-slate-950">${i18n.t('auth.login.submit')}</button>
                  <button type="button" class="rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800" onclick="continueWithCurrentAccess()">${i18n.t('auth.login.continueWithout')}</button>
                </div>
                <p class="mt-3 text-xs text-slate-500">${i18n.t('auth.login.devTip')}</p>
              </form>

              <form id="forgot-password-form" class="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <h3 class="mb-2 text-sm font-semibold text-slate-200">${i18n.t('auth.forgot.title')}</h3>
                <label class="block text-sm text-slate-300">${i18n.t('auth.forgot.emailLabel')}
                  <input id="forgot-password-email" type="email" class="mt-1 w-full rounded bg-slate-950 p-2" placeholder="${i18n.t('auth.login.placeholders.email')}" required />
                </label>
                <div class="mt-3 flex items-center justify-between gap-3">
                  <button type="submit" class="rounded border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800 disabled:opacity-60" ${state.forgotPassword.submitting ? 'disabled' : ''}>${forgotBusy}</button>
                  <a href="/reset-password" class="text-xs text-sky-300 hover:text-sky-200">${i18n.t('auth.forgot.haveToken')}</a>
                </div>
                ${forgotSuccess}
                ${forgotError}
              </form>
            </div>
          </div>
        </div>`;
      }


      function inviteFlowView() {
        const profile = state.inviteFlow.profile || {};
        const title = profile.displayName ? `Welcome, ${profile.displayName}` : 'Welcome to Projectory';
        const subtitle = profile.email ? `Set your password to activate ${profile.email}.` : 'Set your password to activate your account.';
        const busyLabel = state.inviteFlow.submitting ? 'Setting password…' : 'Set password and continue';
        const errorHtml = state.inviteFlow.error ? `<p class="mt-3 text-sm text-rose-300">${state.inviteFlow.error}</p>` : '';

        return `<div class="mx-auto mt-8 max-w-xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
          <h2 class="text-3xl font-bold">${title}</h2>
          <p class="mt-2 text-slate-300">${subtitle}</p>
          <p class="mt-1 text-xs text-slate-500">Invite token: ${state.inviteFlow.token ? 'loaded' : 'missing'}</p>
          <form id="invite-activate-form" class="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <label class="mb-3 block text-sm text-slate-300">New password
              <input id="invite-password" type="password" class="mt-1 w-full rounded bg-slate-950 p-2" minlength="12" required />
            </label>
            <label class="mb-3 block text-sm text-slate-300">Confirm password
              <input id="invite-password-confirm" type="password" class="mt-1 w-full rounded bg-slate-950 p-2" minlength="12" required />
            </label>
            <button type="submit" class="rounded bg-[#00d8ff] px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60" ${state.inviteFlow.submitting ? 'disabled' : ''}>${busyLabel}</button>
          </form>
          ${errorHtml}
        </div>`;
      }

      async function loadInviteFlow(token) {
        state.inviteFlow.loading = true;
        state.inviteFlow.error = '';
        try {
          const payload = await api('/api/auth/invite-preview', {
            method: 'POST',
            body: JSON.stringify({ token })
          });
          state.inviteFlow.profile = payload?.user || null;
        } catch (error) {
          state.inviteFlow.error = error.message || 'Invite could not be loaded.';
          state.inviteFlow.profile = null;
        } finally {
          state.inviteFlow.loading = false;
        }
      }

      window.submitInviteActivation = async function submitInviteActivation(event) {
        event?.preventDefault();
        const password = String(document.getElementById('invite-password')?.value || '');
        const confirm = String(document.getElementById('invite-password-confirm')?.value || '');
        if (!password || password !== confirm) {
          state.inviteFlow.error = 'Passwords do not match.';
          render();
          return;
        }

        state.inviteFlow.submitting = true;
        state.inviteFlow.error = '';
        render();
        try {
          const result = await api('/api/auth/accept-invite', {
            method: 'POST',
            body: JSON.stringify({ token: state.inviteFlow.token, password })
          });

          state.inviteFlow.active = false;
          state.inviteFlow.token = '';
          state.inviteFlow.profile = null;
          state.inviteFlow.submitting = false;
          state.authRequired = true;
          showMessage(`Password set for ${result?.email || 'your account'}. Please log in.`);
          window.history.replaceState({}, '', '/teams');
          render();
        } catch (error) {
          state.inviteFlow.submitting = false;
          state.inviteFlow.error = error.message || 'Invite activation failed.';
          render();
        }
      };


      function resetPasswordFlowView() {
        const busyLabel = state.resetPasswordFlow.submitting ? i18n.t('auth.reset.submitBusy') : i18n.t('auth.reset.submit');
        const errorHtml = state.resetPasswordFlow.error ? `<p class="mt-3 text-sm text-rose-300">${state.resetPasswordFlow.error}</p>` : '';
        const doneHtml = state.resetPasswordFlow.done ? `<p class="mt-3 text-sm text-emerald-300">${i18n.t('auth.reset.success')}</p>` : '';

        return `<div class="mx-auto mt-8 max-w-xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
          <h2 class="text-3xl font-bold">${i18n.t('auth.reset.title')}</h2>
          <p class="mt-2 text-slate-300">${i18n.t('auth.reset.subtitle')}</p>
          <p class="mt-1 text-xs text-slate-500">${i18n.t('auth.reset.tokenStatus', { status: state.resetPasswordFlow.token ? i18n.t('auth.reset.tokenLoaded') : i18n.t('auth.reset.tokenMissing') })}</p>
          <form id="reset-password-form" class="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <label class="mb-3 block text-sm text-slate-300">${i18n.t('auth.reset.newPassword')}
              <input id="reset-password" type="password" class="mt-1 w-full rounded bg-slate-950 p-2" minlength="12" required />
            </label>
            <label class="mb-3 block text-sm text-slate-300">${i18n.t('auth.reset.confirmPassword')}
              <input id="reset-password-confirm" type="password" class="mt-1 w-full rounded bg-slate-950 p-2" minlength="12" required />
            </label>
            <div class="flex items-center gap-3">
              <button type="submit" class="rounded bg-[#00d8ff] px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60" ${state.resetPasswordFlow.submitting ? 'disabled' : ''}>${busyLabel}</button>
              <a href="/teams" class="text-xs text-sky-300 hover:text-sky-200">${i18n.t('auth.reset.backToLogin')}</a>
            </div>
          </form>
          ${doneHtml}
          ${errorHtml}
        </div>`;
      }

      window.submitForgotPassword = async function submitForgotPassword(event) {
        event?.preventDefault();
        const email = String(document.getElementById('forgot-password-email')?.value || '').trim();
        if (!email) {
          state.forgotPassword.error = i18n.t('auth.forgot.emailRequired');
          render();
          return;
        }

        state.forgotPassword.submitting = true;
        state.forgotPassword.submitted = false;
        state.forgotPassword.error = '';
        render();
        try {
          await api('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
          });
          state.forgotPassword.submitting = false;
          state.forgotPassword.submitted = true;
          render();
        } catch (error) {
          state.forgotPassword.submitting = false;
          state.forgotPassword.error = error.message || i18n.t('auth.forgot.genericError');
          render();
        }
      };

      window.submitResetPassword = async function submitResetPassword(event) {
        event?.preventDefault();
        const password = String(document.getElementById('reset-password')?.value || '');
        const confirm = String(document.getElementById('reset-password-confirm')?.value || '');
        if (!password || password !== confirm) {
          state.resetPasswordFlow.error = i18n.t('auth.reset.passwordsMismatch');
          render();
          return;
        }

        state.resetPasswordFlow.submitting = true;
        state.resetPasswordFlow.error = '';
        render();
        try {
          await api('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token: state.resetPasswordFlow.token, password })
          });
          state.resetPasswordFlow.submitting = false;
          state.resetPasswordFlow.done = true;
          state.authRequired = true;
          showMessage(i18n.t('auth.reset.success'));
          window.history.replaceState({}, '', '/teams');
          render();
        } catch (error) {
          state.resetPasswordFlow.submitting = false;
          state.resetPasswordFlow.error = error.message || i18n.t('auth.reset.genericError');
          render();
        }
      };

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
              showMessage('Configuration change reverted.');
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

      function dragConfigurationRowStart(kind, itemKey) {
        if (!isConfigurationKindSortable(kind)) return;
        state.configurationDrag = { kind, itemKey: String(itemKey) };
      }

      function dragConfigurationRowOver(event) {
        event.preventDefault();
      }

      async function dropConfigurationRow(kind, targetItemKey) {
        const dragState = state.configurationDrag;
        state.configurationDrag = null;
        if (!dragState || dragState.kind !== kind || String(dragState.itemKey) === String(targetItemKey)) return;
        const list = [...(state.configurationDraft[kind] || [])]
          .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name || '').localeCompare(String(b.name || '')));
        const sourceIndex = list.findIndex((item) => String(item.id || item.key || item.name) === String(dragState.itemKey));
        const targetIndex = list.findIndex((item) => String(item.id || item.key || item.name) === String(targetItemKey));
        if (sourceIndex < 0 || targetIndex < 0) return;
        const [moved] = list.splice(sourceIndex, 1);
        list.splice(targetIndex, 0, moved);
        const nextDraft = { ...state.configurationDraft, [kind]: normalizeConfigurationSortOrder(list, kind) };
        try {
          await applyConfigurationDraft(nextDraft, `${moved.name} moved.`);
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
          }
        });

        document.addEventListener('change', (event) => {
          const colorInput = event.target.closest('[data-config-action="set-color"]');
          if (colorInput) {
            updateConfigurationItemField(colorInput.dataset.kind, colorInput.dataset.itemKey, 'colorHex', colorInput.value);
            return;
          }

          const presetSelect = event.target.closest('[data-config-action="set-priority-preset"]');
          if (presetSelect && presetSelect.value !== 'custom') {
            updateConfigurationPriorityPreset(presetSelect.dataset.itemKey, presetSelect.value);
          }
        });

        document.addEventListener('focusout', (event) => {
          const nameInput = event.target.closest('[data-config-action="set-name"]');
          if (nameInput) {
            updateConfigurationItemField(nameInput.dataset.kind, nameInput.dataset.itemKey, 'name', nameInput.value);
          }
        });

        document.addEventListener('dragstart', (event) => {
          const row = event.target.closest('[data-config-action="drag-row"]');
          if (!row) return;
          dragConfigurationRowStart(row.dataset.kind, row.dataset.itemKey);
        });

        document.addEventListener('dragover', (event) => {
          const row = event.target.closest('[data-config-action="drag-row"]');
          if (!row) return;
          dragConfigurationRowOver(event);
        });

        document.addEventListener('drop', (event) => {
          const row = event.target.closest('[data-config-action="drag-row"]');
          if (!row) return;
          event.preventDefault();
          dropConfigurationRow(row.dataset.kind, row.dataset.itemKey);
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
        return person.is_leaver ? '<span class="ml-2 rounded border border-amber-500/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">Leaver</span>' : '';
      }

      function personHiddenBadge(person) {
        return person.is_hidden ? '<span class="ml-2 rounded border border-slate-500/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">Hidden</span>' : '';
      }

      function leaverRunIcon(isLeaver) {
        return isLeaver ? ' <span class="iconify inline-block align-[-1px]" data-icon="mdi:run" aria-label="Leaver"></span>' : '';
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
          if (count === 0) return 'text-slate-100';
          if (count <= 5) return 'text-[#00d8ff]';
          if (count <= 8) return 'text-amber-300';
          return 'text-rose-300';
        }

        function roleCountWarningClass(count) {
          if (count === 0) return 'text-slate-100';
          if (count <= 2) return 'text-[#00d8ff]';
          if (count <= 4) return 'text-amber-300';
          return 'text-rose-300';
        }

        function workloadWarningClass(workload) {
          if (workload === 0) return 'text-slate-100';
          if (workload < 100) return 'text-amber-300';
          if (workload === 100) return 'text-green-300';
          return 'text-rose-300';
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
              ? 'cursor-pointer border-t border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20'
              : 'cursor-pointer border-t border-slate-800 hover:bg-slate-800/40';
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

        return `<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div class="mb-3">
            <h3 class="text-lg font-semibold">${i18n.t('home.peopleOverview')}</h3>
            <p class="text-xs text-slate-400">${i18n.t('peopleOverview.subtitle')}</p>
          </div>
          <div class="mb-3 flex items-center gap-2">
            <input
              type="search"
              id="people-overview-search-input"
              value="${state.peopleOverviewSearch || ''}"
              oninput="setPeopleOverviewSearch(this.value)"
              placeholder="${i18n.t('peopleOverview.searchPlaceholder')}"
              class="w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm"
            />
            <button
              class="rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 ${state.peopleOverviewSearch ? '' : 'opacity-50'}"
              onclick="clearPeopleOverviewSearch()"
              ${state.peopleOverviewSearch ? '' : 'disabled'}
              title="Clear search"
            >✕</button>
          </div>
          <table id="onboarding-people-overview-table" class="w-full table-fixed text-left text-sm">
            <thead><tr class="text-slate-400">
              <th class="w-[20%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setPeopleOverviewSortField('name')">${i18n.t('people.columns.name')} ${state.peopleOverviewSort.startsWith('name_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[15%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setPeopleOverviewSortField('trade')">${i18n.t('people.columns.trade')} ${state.peopleOverviewSort.startsWith('trade_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[15%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setPeopleOverviewSortField('level')">${i18n.t('people.columns.level')} ${state.peopleOverviewSort.startsWith('level_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[9%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setPeopleOverviewSortField('assignments')">${i18n.t('peopleOverview.columns.assignments')} ${state.peopleOverviewSort.startsWith('assignments_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[9%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setPeopleOverviewSortField('ownerships')">${i18n.t('peopleOverview.columns.ownerships')} ${state.peopleOverviewSort.startsWith('ownerships_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[9%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setPeopleOverviewSortField('leaderships')">${i18n.t('peopleOverview.columns.leaderships')} ${state.peopleOverviewSort.startsWith('leaderships_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[9%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setPeopleOverviewSortField('contributions')">${i18n.t('peopleOverview.columns.contributions')} ${state.peopleOverviewSort.startsWith('contributions_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
              <th class="w-[14%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setPeopleOverviewSortField('quantity')">${i18n.t('peopleOverview.columns.workload')} ${state.peopleOverviewSort.startsWith('quantity_') ? (state.peopleOverviewSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
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
        function renderCard(kind, label, options = {}) {
          const items = state.configurationDraft[kind] || [];
          const supportsColor = Boolean(options.color);
          const supportsSort = Boolean(options.sort);
          const rows = [...items]
            .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name || '').localeCompare(String(b.name || '')))
            .map((item) => {
              const usage = Number(item.usage_count || 0);
              const usageClass = 'text-[#7cecff] border-[#00d8ff]/50';
              const removeDisabled = usage > 0 ? 'disabled title="In use"' : '';
              const itemKey = item.id || item.key || item.name;
              const escapedItemKey = String(itemKey).replace(/"/g, '&quot;');
              const nameInput = `<input class="w-full rounded bg-slate-900 p-1 text-sm" data-config-action="set-name" data-kind="${kind}" data-item-key="${escapedItemKey}" value="${String(item.name || '').replace(/"/g, '&quot;')}" />`;
              const colorCell = supportsColor
                ? (kind === 'priorities'
                    ? (() => {
                        const selectedPreset = getPriorityPresetFromHex(item.colorHex || '#64748B');
                        const presetPreview = selectedPreset === 'custom'
                          ? `<input type="color" data-config-action="set-color" data-kind="${kind}" data-item-key="${escapedItemKey}" value="${String(item.colorHex || '#64748B')}" class="h-8 w-10 rounded border border-slate-700 bg-transparent" />`
                          : `<span class="inline-flex h-8 w-10 rounded border border-slate-700" style="${PRIORITY_PRESET_MAP[selectedPreset].style}" title="${selectedPreset}"></span>`;
                        return `<div class="flex items-center gap-2"><select class="rounded bg-slate-900 p-1 text-xs" data-config-action="set-priority-preset" data-item-key="${escapedItemKey}"><option value="gold" ${selectedPreset === 'gold' ? 'selected' : ''}>Gold</option><option value="silver" ${selectedPreset === 'silver' ? 'selected' : ''}>Silver</option><option value="bronze" ${selectedPreset === 'bronze' ? 'selected' : ''}>Bronze</option><option value="black" ${selectedPreset === 'black' ? 'selected' : ''}>Black</option><option value="custom" ${selectedPreset === 'custom' ? 'selected' : ''}>Custom hex</option></select>${presetPreview}</div>`;
                      })()
                    : `<input type="color" data-config-action="set-color" data-kind="${kind}" data-item-key="${escapedItemKey}" value="${String(item.colorHex || '#64748B')}" class="h-8 w-10 rounded border border-slate-700 bg-transparent" />`)
                : '—';
              const sortCell = supportsSort ? '<span class="inline-flex items-center rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">↕ Drag</span>' : '—';
              const rowAttrs = supportsSort
                ? `class="border-t border-slate-800 cursor-move hover:bg-slate-900/40" draggable="true" data-config-action="drag-row" data-kind="${kind}" data-item-key="${escapedItemKey}"`
                : 'class="border-t border-slate-800"';
              return `<tr ${rowAttrs}><td class="p-2 text-slate-100">${nameInput}</td><td class="p-2">${colorCell}</td><td class="p-2">${sortCell}</td><td class="p-2"><span class="rounded border px-2 py-0.5 text-xs ${usageClass}">${usage}</span></td><td class="p-2 text-right"><button class="rounded border border-rose-500/50 px-2 py-1 text-xs text-rose-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40" data-config-action="remove-item" data-kind="${kind}" data-item-key="${escapedItemKey}" ${removeDisabled}>${i18n.t('common.delete')}</button></td></tr>`;
            })
            .join('');

          return `<div class="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><div class="mb-3 flex items-center justify-between"><h4 class="text-sm font-semibold text-slate-100">${label}</h4><span class="text-xs text-slate-400">${items.length} ${i18n.t('admin.configuration.items')}</span></div><div class="mb-3 flex gap-2"><input id="configuration-${kind}-new" class="w-full rounded bg-slate-950 p-2 text-sm" placeholder="${i18n.t('admin.configuration.addPlaceholder')}" /><button class="rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800" data-config-action="add-item" data-kind="${kind}">${i18n.t('admin.configuration.add')}</button></div><div class="max-h-72 overflow-y-auto rounded border border-slate-800"><table class="w-full text-left text-sm"><thead><tr class="text-slate-400"><th class="p-2">${i18n.t('admin.configuration.value')}</th><th class="p-2">Color</th><th class="p-2">Sort</th><th class="p-2">${i18n.t('admin.configuration.usage')}</th><th class="p-2 text-right">${i18n.t('common.actions')}</th></tr></thead><tbody>${rows || `<tr><td class="p-3 text-slate-400" colspan="5">${i18n.t('admin.configuration.empty')}</td></tr>`}</tbody></table></div></div>`;
        }

        return `<div class="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-4"><div><h3 class="text-lg font-semibold">${i18n.t('admin.configuration.title')}</h3><p class="text-sm text-slate-400">Manage static catalogs, client priorities and project statuses.</p></div><div class="grid gap-4 md:grid-cols-2">${renderCard('trades', i18n.t('configuration.trades'))}${renderCard('levels', i18n.t('configuration.levels'), { sort: true })}${renderCard('priorities', 'Priorities', { color: true, sort: true })}${renderCard('projectStatuses', 'Project Statuses', { color: true, sort: true })}</div></div>`;
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
        const userRows = (state.adminUsers || []).map((user) => {
          const statusLabel = String(user.status || 'unknown').replace(/_/g, ' ');
          const inviteMeta = user.latestInvitedAt ? `<div class="text-[11px] text-slate-500">Invited: ${user.latestInvitedAt}</div>` : '';
          const revokeButton = user.canRevokeInvite ? `<button class="rounded border border-amber-500/50 px-2 py-1 text-xs text-amber-300 hover:bg-slate-800" onclick="revokeInviteFromAccessTab(${Number(user.id)})">Revoke Invite</button>` : '';
          return `<tr class="border-t border-slate-800"><td class="p-2">${user.displayName}</td><td class="p-2 text-slate-300">${user.email}</td><td class="p-2 text-slate-300">${(user.roles || []).join(', ') || '—'}</td><td class="p-2 text-slate-300">${user.personName || '—'}</td><td class="p-2 text-slate-300"><div class="capitalize">${statusLabel}</div>${inviteMeta}</td><td class="p-2 text-right"><div class="flex flex-wrap justify-end gap-2"><button class="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800" onclick="openAdminUserEditModal(${Number(user.id)})">Edit</button><button class="rounded border border-emerald-500/50 px-2 py-1 text-xs text-emerald-300 hover:bg-slate-800" onclick="inviteAdminUserFromAccessTab(${Number(user.id)})">Invite</button>${revokeButton}<button class="rounded border border-rose-500/50 px-2 py-1 text-xs text-rose-300 hover:bg-slate-800" onclick="deleteAdminUserFromAccessTab(${Number(user.id)})">Delete</button></div></td></tr>`;
        }).join('');
        const auditRows = (state.auditEntries || []).slice(0, 20).map((entry) => `<tr class="border-t border-slate-800"><td class="p-2 text-xs text-slate-300">${entry.created_at || ''}</td><td class="p-2 text-xs">${entry.action || ''}</td><td class="p-2 text-xs text-slate-300">${entry.actor_role || '—'}</td><td class="p-2 text-xs text-slate-300">${entry.entity_type || '—'} ${entry.entity_id || ''}</td></tr>`).join('');
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
          <div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 class="mb-3 text-lg font-semibold">${i18n.t('admin.access.title')}</h3>
            <div class="mb-3 grid gap-3 md:grid-cols-5">
              <label class="text-xs text-slate-400">${i18n.t('admin.access.fields.displayName')}
                <input id="access-user-name" class="mt-1 w-full rounded bg-slate-950 p-2 text-sm" placeholder="${i18n.t('admin.access.fields.displayName')}" />
              </label>
              <label class="text-xs text-slate-400">${i18n.t('admin.access.fields.email')}
                <input id="access-user-email" class="mt-1 w-full rounded bg-slate-950 p-2 text-sm" placeholder="${i18n.t('admin.access.fields.email')}" />
              </label>
              <label class="text-xs text-slate-400">${i18n.t('admin.access.fields.role')}
                <select id="access-user-role" class="mt-1 w-full rounded bg-slate-950 p-2 text-sm">
                  <option value="viewer">${i18n.t('admin.access.roles.viewer')}</option>
                  <option value="planner">${i18n.t('admin.access.roles.planner')}</option>
                  <option value="teammate">${i18n.t('admin.access.roles.teammate')}</option>
                  <option value="admin">${i18n.t('admin.access.roles.admin')}</option>
                </select>
              </label>
              <label class="text-xs text-slate-400 md:col-span-2">${i18n.t('admin.access.fields.person')}
                <input id="access-user-person" list="access-user-person-options" class="mt-1 w-full rounded bg-slate-950 p-2 text-sm" placeholder="${i18n.t('admin.access.fields.personPlaceholder')}" />
                <datalist id="access-user-person-options">${personOptionsHtml}</datalist>
                <span class="mt-1 block text-[11px] text-slate-500">${i18n.t('admin.access.fields.personHelp')}</span>
              </label>
              <button class="rounded border border-[#00d8ff]/50 px-3 py-2 text-sm text-[#7cecff] hover:bg-slate-800 md:col-start-5" onclick="createAdminUserFromAccessTab()">${i18n.t('admin.access.actions.createUser')}</button>
            </div>
            <div class="overflow-x-auto rounded border border-slate-800"><table class="w-full text-left text-sm"><thead><tr class="text-slate-400"><th class="p-2">${i18n.t('admin.access.table.name')}</th><th class="p-2">${i18n.t('admin.access.table.email')}</th><th class="p-2">${i18n.t('admin.access.table.roles')}</th><th class="p-2">${i18n.t('admin.access.table.person')}</th><th class="p-2">Status</th><th class="p-2 text-right">Actions</th></tr></thead><tbody>${userRows || `<tr><td class="p-3 text-slate-400" colspan="6">${i18n.t('admin.access.table.empty')}</td></tr>`}</tbody></table></div>
          </div>

          <div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 class="mb-3 text-lg font-semibold">${i18n.t('admin.smtp.title')}</h3>
            <div class="grid gap-3 md:grid-cols-3">
              <label class="text-xs text-slate-400">${i18n.t('admin.smtp.fields.host')}
                <input id="smtp-host" class="mt-1 w-full rounded bg-slate-950 p-2 text-sm" placeholder="${i18n.t('admin.smtp.placeholders.host')}" value="${smtp.host || ''}" />
              </label>
              <label class="text-xs text-slate-400">${i18n.t('admin.smtp.fields.port')}
                <input id="smtp-port" class="mt-1 w-full rounded bg-slate-950 p-2 text-sm" placeholder="${i18n.t('admin.smtp.placeholders.port')}" value="${smtp.port || ''}" />
              </label>
              <label class="text-xs text-slate-400">${i18n.t('admin.smtp.fields.username')}
                <input id="smtp-user" class="mt-1 w-full rounded bg-slate-950 p-2 text-sm" placeholder="${i18n.t('admin.smtp.placeholders.username')}" value="${smtp.username || ''}" />
              </label>
              <label class="text-xs text-slate-400 md:col-span-2">${i18n.t('admin.smtp.fields.fromEmail')}
                <input id="smtp-from" class="mt-1 w-full rounded bg-slate-950 p-2 text-sm" placeholder="${i18n.t('admin.smtp.placeholders.fromEmail')}" value="${smtp.fromEmail || ''}" />
              </label>
              <label class="text-xs text-slate-400">${i18n.t('admin.smtp.fields.password')}
                <input id="smtp-password" type="password" class="mt-1 w-full rounded bg-slate-950 p-2 text-sm" placeholder="${smtp.passwordSet ? i18n.t('admin.smtp.placeholders.passwordSet') : i18n.t('admin.smtp.placeholders.password')}" />
              </label>
              <label class="inline-flex items-center gap-2 self-end text-sm"><input id="smtp-enabled" type="checkbox" ${smtp.enabled ? 'checked' : ''} /> ${i18n.t('admin.smtp.fields.enabled')}</label>
              <label class="inline-flex items-center gap-2 self-end text-sm"><input id="smtp-secure" type="checkbox" ${smtp.secure !== false ? 'checked' : ''} /> ${i18n.t('admin.smtp.fields.secure')}</label>
              <button class="rounded border border-[#00d8ff]/50 px-3 py-2 text-sm text-[#7cecff] hover:bg-slate-800" onclick="saveSmtpSettingsFromAccessTab()">${i18n.t('admin.smtp.actions.save')}</button>
              <label class="text-xs text-slate-400 md:col-span-2">${i18n.t('admin.smtp.fields.testRecipient')}
                <input id="smtp-test-to" class="mt-1 w-full rounded bg-slate-950 p-2 text-sm" placeholder="${i18n.t('admin.smtp.placeholders.testRecipient')}" value="${state.smtpTestRecipient || smtp.fromEmail || ''}" />
              </label>
              <button class="rounded border border-emerald-500/50 px-3 py-2 text-sm text-emerald-300 hover:bg-slate-800" onclick="sendSmtpTestMailFromAccessTab()">${i18n.t('admin.smtp.actions.sendTest')}</button>
            </div>
          </div>

          <div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div class="mb-3 flex items-center justify-between"><h3 class="text-lg font-semibold">${i18n.t('admin.audit.title')}</h3><button class="rounded border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800" onclick="refreshAuditFromAccessTab()">${i18n.t('admin.audit.refresh')}</button></div>
            <div class="max-h-80 overflow-y-auto rounded border border-slate-800"><table class="w-full text-left text-sm"><thead><tr class="text-slate-400"><th class="p-2">${i18n.t('admin.audit.columns.timestamp')}</th><th class="p-2">${i18n.t('admin.audit.columns.action')}</th><th class="p-2">${i18n.t('admin.audit.columns.role')}</th><th class="p-2">${i18n.t('admin.audit.columns.entity')}</th></tr></thead><tbody>${auditRows || `<tr><td class="p-3 text-slate-400" colspan="4">${i18n.t('admin.audit.empty')}</td></tr>`}</tbody></table></div>
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
          showMessage('User not found.', 'error');
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
          personSelect.innerHTML = `<option value="">Unlinked</option>${options.map((person) => `<option value="${person.id}">${person.name}</option>`).join('')}`;
        }

        document.getElementById('admin-user-edit-id').value = String(user.id);
        document.getElementById('admin-user-edit-name').value = String(user.displayName || '');
        document.getElementById('admin-user-edit-email').value = String(user.email || '');
        document.getElementById('admin-user-edit-role').value = String((user.roles || [])[0] || 'viewer').toLowerCase();
        document.getElementById('admin-user-edit-person').value = user.personId ? String(user.personId) : '';

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
          const roleInput = String(document.getElementById('admin-user-edit-role')?.value || 'viewer').trim().toLowerCase();
          const personValue = String(document.getElementById('admin-user-edit-person')?.value || '').trim();

          await api(`/api/admin/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              displayName,
              email,
              role: roleInput,
              personId: personValue ? Number(personValue) : null,
              isActive: true
            })
          });

          await loadAdminAccessData();
          closeAdminUserEditModal();
          render();
          showMessage('User updated.');
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
          if (!window.confirm(`Delete user ${user.displayName} (${user.email})?`)) return;

          await api(`/api/admin/users/${Number(userId)}`, { method: 'DELETE' });
          await loadAdminAccessData();
          render();
          showMessage('User deleted.');
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
          showMessage('Invite sent.');
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };



      window.revokeInviteFromAccessTab = async function revokeInviteFromAccessTab(userId) {
        try {
          await api(`/api/admin/users/${Number(userId)}/invite/revoke`, { method: 'POST' });
          await loadAdminAccessData();
          render();
          showMessage('Invite revoked.');
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

      function ownershipView() {
        const projects = state.projectsPayload.projects;
        const viewerMode = isViewerMode();
        const viewerPersonId = currentPersonId();

        if (projects.length === 0) {
          return `<div class="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">No projects available yet. Ask an admin to create one first.</div>`;
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

          const projectRows = filteredProjects
            .map((project) => {
              const hasCurrentUserAssignment = viewerPersonId && state.projectsPayload.assignments.some((assignment) => Number(assignment.project_id) === Number(project.id) && String(assignment.person_id) === viewerPersonId);
              const ownerPills = project.ownerEntries.length
                ? project.ownerEntries
                    .map((person) => {
                      const isSelf = viewerPersonId && String(person.id) === viewerPersonId;
                      const ownerClass = isSelf
                        ? 'border-blue-300 bg-blue-500 text-blue-50'
                        : 'border-blue-400/70 bg-blue-600 text-blue-50';
                      return `<span class="mb-1 mr-1 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${ownerClass}">${selfRoleIcon(isSelf)}<span>${person.name}${leaverRunIcon(person.isLeaver)}</span></span>`;
                    })
                    .join('')
                : `<span class="text-slate-400">${i18n.t('clientTeams.noOwnerAssigned')}</span>`;
              const leaderPills = project.leaderEntries.length
                ? project.leaderEntries
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
                    .join('')
                : `<span class="text-slate-400">${i18n.t('clientTeams.noLeaderAssigned')}</span>`;

              const rowClass = hasCurrentUserAssignment
                ? 'cursor-pointer border-t border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20'
                : 'cursor-pointer border-t border-slate-800 hover:bg-slate-800/40';

              return `<tr class="${rowClass}" onclick="openProjectDetail(${project.id})">
                <td class="p-2 text-slate-300">${renderProjectStatusPill(project.status, project.id)}</td>
                <td class="p-2">
                  <div class="font-medium text-slate-100">${project.name}</div>
                </td>
                <td class="p-2 text-slate-300">${project.client_name}</td>
                <td class="p-2 text-slate-300">${formatEuroWhole(project.budget_cents)}</td>
                <td class="p-2 text-slate-300">${renderPriorityPill(project.priority_name, project.priority_color_hex)}</td>
                <td class="p-2 text-slate-300">${ownerPills}</td>
                <td class="p-2 text-slate-300">${leaderPills}</td>
              </tr>`;
            })
            .join('');

          return `<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div class="mb-3">
              <h3 class="text-lg font-semibold">${i18n.t('clientTeams.title')}</h3>
              <p class="text-xs text-slate-400">${i18n.t('clientTeams.subtitle')}</p>
            </div>
            <div class="mb-3 flex items-center gap-2">
              <input
                type="search"
                id="client-teams-search-input"
                value="${state.clientTeamsSearch || ''}"
                oninput="setClientTeamsSearch(this.value)"
                placeholder="${i18n.t('clientTeams.searchPlaceholder')}"
                class="w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm"
              />
              <button
                class="rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 ${state.clientTeamsSearch ? '' : 'opacity-50'}"
                onclick="clearClientTeamsSearch()"
                ${state.clientTeamsSearch ? '' : 'disabled'}
                title="Clear search"
              >✕</button>
            </div>
            <table id="onboarding-project-overview-table" class="w-full table-fixed text-left text-sm">
              <thead>
                <tr class="text-slate-400">
                  <th class="w-[7%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setClientTeamsSortField('status')">${i18n.t('clientTeams.columns.status')} ${state.clientTeamsSort.startsWith('status_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                  <th class="w-[23%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setClientTeamsSortField('product')">${i18n.t('clientTeams.columns.product')} ${state.clientTeamsSort.startsWith('product_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                  <th class="w-[14%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setClientTeamsSortField('client')">${i18n.t('clientTeams.columns.client')} ${state.clientTeamsSort.startsWith('client_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                  <th class="w-[8%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setClientTeamsSortField('budget')">${i18n.t('clientTeams.columns.budget')} ${state.clientTeamsSort.startsWith('budget_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                  <th class="w-[11%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setClientTeamsSortField('priority')">${i18n.t('clientTeams.columns.priority')} ${state.clientTeamsSort.startsWith('priority_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                  <th class="w-[14%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setClientTeamsSortField('owner')">${i18n.t('clientTeams.columns.owner')} ${state.clientTeamsSort.startsWith('owner_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                  <th class="w-[30%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setClientTeamsSortField('leaders')">${i18n.t('clientTeams.columns.leaders')} ${state.clientTeamsSort.startsWith('leaders_') ? (state.clientTeamsSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th>
                </tr>
              </thead>
              <tbody>${projectRows}</tbody>
            </table>
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
                    ? 'border-slate-300 border-dotted bg-slate-200/10 text-slate-100'
                    : 'border-slate-300 bg-slate-100 text-slate-900';
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

          return `<div ${containerId ? `id="${containerId}"` : ''} class="rounded border border-slate-700 bg-slate-950/60 p-3">
            <h4 class="mb-2 text-sm font-semibold text-slate-200">${tierLabel}</h4>
            <div class="flex flex-wrap gap-2">${entries || '<span class="text-xs text-slate-400">None</span>'}</div>
          </div>`;
        }

        const projectPeopleOverview = `<div id="onboarding-project-team-overview" class="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 class="mb-3 text-lg font-semibold">${i18n.t('projectDetail.teamOverview.title')}</h3>
          <p class="mb-3 text-xs text-slate-400">${i18n.t('projectDetail.teamOverview.subtitle')}</p>
          <div class="space-y-3">
            ${renderTierPeople(ownerIds, 'Client owner(s)', 'border-blue-400/70 bg-blue-600 text-blue-50', 'border-blue-400/70 bg-blue-600 text-blue-50', () => false, 'onboarding-client-owners')}
            ${renderTierPeople(leaderIds, 'Client leader(s)', 'border-emerald-400/70 bg-emerald-600 text-emerald-50', 'border-emerald-400/70 border-dotted bg-transparent text-emerald-200', (personId) => ownerIds.has(personId), 'onboarding-client-leaders')}
            ${renderTierPeople(contributorIds, 'Contributors', 'border-slate-500 bg-slate-700 text-slate-100', 'border-slate-500 border-dotted bg-transparent text-slate-300', (personId) => ownerIds.has(personId) || leaderIds.has(personId), 'onboarding-contributors')}
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

        const challengeRows = sortedChallenges
          .map((challenge) => {
            const assignments = assignmentsByChallenge.get(String(challenge.id)) || [];
            const assignees = assignments.length
              ? [...assignments]
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
                          ? (isSelf ? 'border-slate-300 border-dotted bg-slate-200/10 text-slate-100' : 'border-slate-500 border-dotted bg-transparent text-slate-300')
                          : (isSelf ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-slate-500 bg-slate-700 text-slate-100');
                    const roleLabel = assignment.is_owner ? i18n.t('assign.roleOwner') : assignment.is_leader ? i18n.t('assign.roleLeader') : i18n.t('assign.roleContributor');
                    const assignmentLabel = `${selfRoleIcon(isSelf)}<span>${assignment.first_name} ${assignment.last_name}${leaverRunIcon(assignment.is_leaver)} (${roleLabel})</span>`;
                    if (viewerMode) {
                      return `<span class="mb-1 mr-1 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${roleClass}">${assignmentLabel}</span>`;
                    }
                    return `<button class="mb-1 mr-1 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${roleClass} hover:brightness-110" onclick='openAssignModal(${challenge.id}, ${JSON.stringify(challenge.title)}, ${JSON.stringify(assignment)})'>${assignmentLabel}</button>`;
                  })
                  .join('')
              : viewerMode ? `<span class="text-slate-400">—</span>` : `<button class="rounded border border-[#00d8ff]/50 px-2 py-1 text-xs text-[#00d8ff]" onclick='openAssignModal(${challenge.id}, ${JSON.stringify(challenge.title)})'>Assign</button>`;
            const actionItems = viewerMode ? [] : [
              `<button class="w-full rounded border border-slate-600 px-2 py-1 text-left text-xs hover:bg-slate-800" onclick='openChallengeModal(${JSON.stringify(challenge)})'>${i18n.t('common.edit')}</button>`,
              `<button class="w-full rounded border border-rose-500/50 px-2 py-1 text-left text-xs text-rose-300 hover:bg-slate-800" onclick='deleteChallenge(${challenge.id})'>${i18n.t('common.delete')}</button>`
            ];

            if (assignments.length >= 1) {
              actionItems.push(`<button class="w-full rounded border border-[#00d8ff]/50 px-2 py-1 text-left text-xs text-[#00d8ff] hover:bg-slate-800" onclick='openAssignModal(${challenge.id}, ${JSON.stringify(challenge.title)})'>${i18n.t('projectDetail.actions.addAssignee')}</button>`);
            }

            if (assignments.length === 1) {
              actionItems.push(`<button class="w-full rounded border border-rose-500/50 px-2 py-1 text-left text-xs text-rose-300 hover:bg-slate-800" onclick='deleteAssignment(${assignments[0].id})'>${i18n.t('projectDetail.actions.unassignNamed', { name: assignments[0].first_name })}</button>`);
            } else if (assignments.length > 1) {
              actionItems.push(`<button class="w-full rounded border border-rose-500/50 px-2 py-1 text-left text-xs text-rose-300 hover:bg-slate-800" onclick='openUnassignModal(${challenge.id})'>${i18n.t('projectDetail.actions.unassign')}</button>`);
            }

            const actionsMenu = viewerMode ? '' : `<details class="relative inline-block">
              <summary class="list-none cursor-pointer rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"><span class="inline-flex items-center gap-1"><span class="iconify" data-icon="mdi:puzzle-edit-outline" aria-hidden="true"></span><span>${i18n.t('projectDetail.actionsMenu')}</span></span></summary>
              <div class="absolute right-0 z-30 mt-1 w-52 space-y-1 rounded border border-slate-700 bg-slate-900 p-2 shadow-xl">${actionItems.join('')}</div>
            </details>`;

            return `<tr class="border-t border-slate-800">
              <td class="p-2">${challenge.title}</td>
              <td class="p-2">${challenge.description}</td>
              <td class="p-2">${assignees}</td>
              <td class="p-2 text-right"><div class="flex justify-end">${actionsMenu}</div></td>
            </tr>`;
          })
          .join('');

        const statusPresentation = getProjectStatusPresentation(selectedProject.status);
        const statusControl = viewerMode
          ? `<div class="inline-flex h-9 items-center gap-2 rounded-md border border-slate-600 bg-slate-950 px-3"><span class="h-2.5 w-2.5 rounded-full ${statusPresentation.classes}"></span><span class="text-xs font-semibold text-slate-100">${statusPresentation.label}</span></div>`
          : `<button class="inline-flex h-9 items-center gap-2 rounded-md border border-slate-600 bg-slate-950 px-3 hover:bg-slate-800" onclick="openProjectStatusModal(${selectedProject.id}, '${String(selectedProject.status || 'white').toLowerCase()}')"><span class="h-2.5 w-2.5 rounded-full ${statusPresentation.classes}"></span><span class="text-xs font-semibold text-slate-100">${statusPresentation.label}</span></button>`;

        const priorityControl = viewerMode || isTeammateMode()
          ? `<div class="inline-flex h-9 items-center">${renderPriorityPill(selectedProject.priority_name, selectedProject.priority_color_hex)}</div>`
          : `<button class="inline-flex h-9 items-center" onclick="openProjectPriorityModal(${selectedProject.client_id}, ${selectedProject.priority_id})">${renderPriorityPill(selectedProject.priority_name, selectedProject.priority_color_hex)}</button>`;

        return `<div class="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div class="grid grid-cols-1 gap-3 text-sm text-slate-300 lg:grid-cols-6 lg:items-center">
              <div class="flex min-w-0 flex-wrap items-center gap-2 lg:col-span-3">
                <button class="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" onclick='goToProjectOverview()'>${i18n.t('clientTeams.title')}</button>
                <span>/</span>
                <span class="font-semibold text-slate-100">${selectedProject.name} (${selectedProject.client_name})</span>
              </div>
              <div class="flex min-w-0 flex-col justify-center text-xs"><span class="mb-1 text-slate-400">Status</span><div class="flex h-9 items-center">${statusControl}</div></div>
              <div class="flex min-w-0 flex-col justify-center text-xs"><span class="mb-1 text-slate-400">${i18n.t('clientTeams.columns.priority')}</span><div class="flex h-9 items-center">${priorityControl}</div></div>
              <div class="flex min-w-0 flex-col justify-center text-xs"><span class="mb-1 text-slate-400">${i18n.t('clientTeams.columns.budget')}</span><div class="flex h-9 items-center px-1 text-xs font-semibold text-slate-100">${formatEuroWhole(selectedProject.budget_cents)}</div></div>
            </div>
          </div>

          <div id="onboarding-challenge-overview" class="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div class="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 class="text-lg font-semibold">${i18n.t('projectDetail.challengeOverview.title')}</h3>
                <p class="text-xs text-slate-400">${i18n.t('projectDetail.challengeOverview.subtitle')}</p>
              </div>
              ${viewerMode ? '' : `<button id="onboarding-add-challenge" class="inline-flex items-center gap-2 rounded bg-[#00d8ff] text-slate-950 px-3 py-2 text-sm font-semibold" onclick='openChallengeModal()'><span class="iconify text-base" data-icon="mdi:puzzle-plus" aria-hidden="true"></span><span>${i18n.t('challenge.add')}</span></button>`}
            </div>
            <table class="w-full table-fixed text-left text-sm"><thead><tr class="text-slate-400"><th class="w-[19%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setChallengesSortField('title')">${i18n.t('challenge.columns.title')} ${state.challengesSort.startsWith('title_') ? (state.challengesSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="w-[50%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setChallengesSortField('description')">${i18n.t('challenge.columns.description')} ${state.challengesSort.startsWith('description_') ? (state.challengesSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="w-[20%] p-2"><button class="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-100" onclick="setChallengesSortField('assignees')">${i18n.t('challenge.columns.assignee')} ${state.challengesSort.startsWith('assignees_') ? (state.challengesSort.endsWith('_asc') ? '↑' : '↓') : ''}</button></th><th class="w-[11%] p-2 text-right">${i18n.t('common.actions')}</th></tr></thead><tbody>${challengeRows}</tbody></table>
          </div>

          ${projectPeopleOverview}`;
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

        if (people.length === 0) {
          list.innerHTML = `<p class="p-2 text-sm text-slate-400">${i18n.t('assign.noMatches')}</p>`;
          state.assignModal.selectedPersonId = '';
          return;
        }

        if (!people.some((person) => String(person.id) === String(state.assignModal.selectedPersonId))) {
          state.assignModal.selectedPersonId = String(people[0].id);
        }

        list.innerHTML = people
          .map(
            (person) => `<label class="mb-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-900">
              <input type="radio" name="assign-person" value="${person.id}" ${String(state.assignModal.selectedPersonId) === String(person.id) ? 'checked' : ''} />
              <span>${person.first_name} ${person.last_name}${person.is_leaver ? " <span class=\"ml-1 rounded border border-amber-500/60 px-1 py-0.5 text-[10px] uppercase tracking-wide text-amber-300\">Leaver</span>" : ""} <span class="text-xs text-slate-400">(${person.trade_name})</span></span>
            </label>`
          )
          .join('');

        list.querySelectorAll('input[name="assign-person"]').forEach((input) => {
          input.addEventListener('change', () => {
            state.assignModal.selectedPersonId = input.value;
          });
        });
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
        document.getElementById('admin-person-trade').innerHTML = optionList(state.meta.trades, person?.trade_id);
        document.getElementById('admin-person-level').innerHTML = optionList(state.meta.levels, person?.level_id);
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
        document.getElementById('admin-client-priority').innerHTML = optionList(state.meta.priorities, client?.priority_id);
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
        document.getElementById('admin-project-client').innerHTML = optionList(state.clients, project?.client_id);
        document.getElementById('admin-project-status').innerHTML = (state.meta.projectStatuses || []).map((item) => `<option value="${item.key}">${item.label}</option>`).join('');
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
        root.innerHTML = adminTabs
          .map((tab) => `<button class="rounded-lg border px-4 py-2 text-sm font-semibold ${state.adminTab === tab.id ? 'border-[#00d8ff] bg-[#00d8ff]/15 text-[#7cecff]' : 'border-slate-700 bg-slate-900 text-slate-300'}" data-admin-tab="${tab.id}">${tab.label}</button>`)
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

      async function downloadExport(format) {
        const scope = String(document.getElementById('export-scope')?.value || 'app');
        const endpoint = scope === 'configuration' ? '/api/export/config' : '/api/export';
        const prefix = scope === 'configuration' ? 'projectory-configuration-export' : 'projectory-export';
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

        const preview = document.getElementById('import-preview');
        const confirmButton = document.getElementById('import-confirm');
        const tradesRow = document.getElementById('import-count-trades-row');
        const levelsRow = document.getElementById('import-count-levels-row');
        const appRows = [
          document.getElementById('import-count-people')?.closest('li'),
          document.getElementById('import-count-clients')?.closest('li'),
          document.getElementById('import-count-projects')?.closest('li'),
          document.getElementById('import-count-challenges')?.closest('li'),
          document.getElementById('import-count-assignments')?.closest('li')
        ].filter(Boolean);
        const isConfiguration = state.importScope === 'configuration';
        appRows.forEach((row) => row.classList.toggle('hidden', isConfiguration));
        tradesRow?.classList.toggle('hidden', !isConfiguration);
        levelsRow?.classList.toggle('hidden', !isConfiguration);

        if (!state.importPreviewData) {
          preview.classList.add('hidden');
          if (confirmButton) confirmButton.disabled = true;
          return;
        }

        preview.classList.remove('hidden');
        document.getElementById('import-count-people').textContent = state.importPreviewData.summary.people;
        document.getElementById('import-count-clients').textContent = state.importPreviewData.summary.clients;
        document.getElementById('import-count-projects').textContent = state.importPreviewData.summary.projects;
        document.getElementById('import-count-challenges').textContent = state.importPreviewData.summary.challenges;
        document.getElementById('import-count-assignments').textContent = state.importPreviewData.summary.assignments;
        document.getElementById('import-count-trades').textContent = state.importPreviewData.summary.trades || 0;
        document.getElementById('import-count-levels').textContent = state.importPreviewData.summary.levels || 0;
        if (confirmButton) confirmButton.disabled = false;
      }

      function closeImportModal() {
        state.importModalOpen = false;
        state.importPreviewData = null;
        const input = document.getElementById('import-file');
        if (input) input.value = '';
        renderImportModal();
      }

      function renderProjectStatusModal() {
        const modal = document.getElementById('project-status-modal');
        modal.classList.toggle('hidden', !state.projectStatusModal.open);
        modal.classList.toggle('flex', state.projectStatusModal.open);
        if (!state.projectStatusModal.open) return;
        const select = document.getElementById('project-status-select');
        if (select) {
          const statusOptions = state.meta.projectStatuses || [];
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
          showMessage('Invalid status selected.', 'error');
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

      function openImportModal() {
        state.importModalOpen = true;
        state.importScope = 'app';
        state.importPreviewData = null;
        renderImportModal();
      }

      function detectImportFormat(file) {
        const name = file.name.toLowerCase();
        if (name.endsWith('.csv')) return 'csv';
        return 'json';
      }

      async function previewImportFile(file) {
        const format = detectImportFormat(file);
        const text = await file.text();
        const scope = String(document.getElementById('import-scope')?.value || state.importScope || 'app');
        state.importScope = scope;

        const previewEndpoint = scope === 'configuration' ? '/api/import/config/preview' : '/api/import/preview';

        if (format === 'json') {
          const payload = JSON.parse(text);
          const preview = await api(previewEndpoint, {
            method: 'POST',
            body: JSON.stringify({ format: 'json', data: payload.data || payload })
          });
          state.importPreviewData = preview;
          renderImportModal();
          return;
        }

        const preview = await api(previewEndpoint, {
          method: 'POST',
          body: JSON.stringify({ format: 'csv', content: text })
        });
        state.importPreviewData = preview;
        renderImportModal();
      }

      async function confirmImport() {
        if (!state.importPreviewData?.data) {
          showMessage('Please choose a valid JSON or CSV file first.', 'error');
          return;
        }

        const endpoint = state.importScope === 'configuration' ? '/api/import/config' : '/api/import';
        await api(endpoint, { method: 'POST', body: JSON.stringify({ data: state.importPreviewData.data }) });
        await loadData();
        render();
        closeImportModal();
        showMessage('Import completed.');
      }


      function onboardingSteps() {
        return onboardingTour.filterOnboardingStepsByRole(onboardingDemo.steps, currentRole());
      }

      function clearOnboardingHighlight() {
        if (!onboardingDemo.highlightedElement) return;
        onboardingDemo.highlightedElement.classList.remove('ring-4', 'ring-indigo-400', 'ring-offset-2', 'ring-offset-slate-950', 'relative', 'z-[82]');
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
          target.classList.add('ring-4', 'ring-indigo-400', 'ring-offset-2', 'ring-offset-slate-950', 'relative', 'z-[82]');
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
        document.getElementById('export-confirm')?.addEventListener('click', async () => {
          try {
            const format = document.getElementById('export-format').value;
            await downloadExport(format);
            closeExportModal();
            showMessage('Export completed.');
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
        document.getElementById('import-scope')?.addEventListener('change', (event) => {
          state.importScope = event.target.value;
          state.importPreviewData = null;
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
        document.getElementById('app-logo-button')?.addEventListener('click', () => {
          state.showAdmin = false;
          state.homeTab = 'client-teams';
          state.selectedProjectId = '';
          state.peopleOverviewModal.open = false;
          state.peopleOverviewModal.personId = null;
          navigateFromState();
          render();
        });

        document.getElementById('admin-toggle')?.addEventListener('click', () => {
          if (!canAccessAdmin()) return;
          state.showAdmin = true;
          navigateFromState();
          render();
        });

        document.getElementById('admin-close')?.addEventListener('click', () => {
          state.showAdmin = false;
          navigateFromState();
          render();
        });

        document.getElementById('locale-select')?.addEventListener('change', (event) => {
          i18n.setLocale(event.target.value);
          render();
        });

        document.getElementById('auth-logout')?.addEventListener('click', async () => {
          try {
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
        list.innerHTML = assignments
          .map((assignment) => {
            const checked = state.unassignModal.selectedAssignmentIds.includes(String(assignment.id)) ? 'checked' : '';
            const roleLabel = assignment.is_owner ? i18n.t('assign.roleOwner') : assignment.is_leader ? i18n.t('assign.roleLeader') : i18n.t('assign.roleContributor');
            return `<label class="mb-1 flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-900">
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
            showMessage('Select at least one assignee to unassign.', 'warning');
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
            showMessage('Please select a person to assign.', 'error');
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
              showMessage('Current assignment could not be found.', 'error');
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

      window.setClientTeamsSortField = function setClientTeamsSortField(field) {
        const asc = `${field}_asc`;
        const desc = `${field}_desc`;
        state.clientTeamsSort = state.clientTeamsSort === asc ? desc : asc;
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
          showMessage('Client not found.', 'error');
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

      function renderPeopleOverviewModal() {
        const modal = document.getElementById('people-overview-modal');
        modal.classList.toggle('hidden', !state.peopleOverviewModal.open);
        modal.classList.toggle('flex', state.peopleOverviewModal.open);

        if (!state.peopleOverviewModal.open) {
          return;
        }

        const person = state.people.find((item) => String(item.id) === String(state.peopleOverviewModal.personId));
        if (!person) {
          document.getElementById('people-overview-modal-title').textContent = 'Person assignments';
          document.getElementById('people-overview-modal-body').innerHTML = '<p class="text-slate-300">No assignments found.</p>';
          return;
        }

        const assignments = state.projectsPayload.assignments.filter((assignment) => String(assignment.person_id) === String(person.id));
        document.getElementById('people-overview-modal-title').textContent = `${person.first_name} ${person.last_name} · Assignments`;

        if (assignments.length === 0) {
          document.getElementById('people-overview-modal-body').innerHTML = '<p class="text-slate-300">No assignments for this person.</p>';
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

        const tableRows = Array.from(grouped.entries())
          .map(([projectId, projectAssignments]) => {
            const project = projectById.get(projectId);
            const projectName = project ? `${project.name} (${project.client_name})` : `Project ${projectId}`;

            const assignmentRows = projectAssignments
              .map((assignment) => {
                const roleLabel = assignment.is_owner ? i18n.t('assign.roleOwner') : assignment.is_leader ? i18n.t('assign.roleLeader') : i18n.t('assign.roleContributor');
                const roleClass = assignment.is_owner ? 'text-blue-300' : assignment.is_leader ? 'text-emerald-300' : 'text-slate-100';
                const challenge = challengeById.get(String(assignment.challenge_id));
                const challengeDescription = challenge?.description || 'No description available.';
                const quantity = Math.round(Number(assignment.quantity || 0));
                const barColor = assignment.is_owner ? 'bg-blue-500' : assignment.is_leader ? 'bg-emerald-500' : 'bg-slate-100';

                return `<tr class="border-t border-slate-800">
                  <td class="p-2 pl-6">
                    <button class="w-full text-left hover:opacity-90" onclick='openChallengeFromPeopleOverviewModal(${JSON.stringify(challenge || { id: assignment.challenge_id, title: assignment.challenge_title, description: challengeDescription, project_id: assignment.project_id })})'>
                      <div class="font-medium text-slate-100 underline decoration-slate-600 underline-offset-2">${assignment.challenge_title}</div>
                      <div class="text-slate-400">${challengeDescription}</div>
                    </button>
                  </td>
                  <td class="p-2"><span class="font-semibold ${roleClass}">${roleLabel}</span></td>
                  <td class="p-2 text-right">
                    <div class="font-semibold">${quantity}% (${formatWorkloadDuration(quantity, person.working_hours)})</div>
                    <div class="mt-1 ml-auto h-2 w-32 overflow-hidden rounded bg-slate-800"><div class="h-full ${barColor}" style="width:${Math.max(0, Math.min(100, quantity))}%"></div></div>
                  </td>
                </tr>`;
              })
              .join('');

            const adjustControl = isViewerMode() ? '' : `<button class="rounded border border-[#00d8ff]/50 px-2 py-1 text-xs text-[#00d8ff] hover:bg-slate-800" onclick="adjustProjectPersonQuantity(${projectId}, ${person.id}, true)">${i18n.t('peopleOverview.adjustWorkload')}</button>`;
            return `<tr class="border-t border-slate-700 bg-slate-900/70"><td class="p-2 font-semibold text-slate-100" colspan="2">${projectName}</td><td class="p-2 text-right">${adjustControl}</td></tr>${assignmentRows}`;
          })
          .join('');

        document.getElementById('people-overview-modal-body').innerHTML = `<table class="w-full text-left text-xs rounded border border-slate-700 overflow-hidden">
          <thead>
            <tr class="text-slate-400 bg-slate-950/70">
              <th class="p-2">${i18n.t('entity.challenges')}</th>
              <th class="p-2">${i18n.t('assign.role')}</th>
              <th class="p-2">${i18n.t('peopleOverview.columns.workload')}</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>`;
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

      window.deleteChallenge = async function deleteChallenge(id) {
        const challenge = state.projectsPayload.challenges.find((item) => String(item.id) === String(id));
        if (!challenge) {
          showMessage('Challenge not found.', 'error');
          return;
        }

        try {
          await api(`/api/challenges/${id}`, { method: 'DELETE' });
          await loadData();
          render();

          showMessage('Challenge deleted.', 'warning', {
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
                showMessage('Challenge restored.');
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

      function parseAppRoute(pathname) {
        const normalized = String(pathname || '/').replace(/^\/+|\/+$/g, '');
        const parts = normalized ? normalized.split('/') : [];

        if (parts.length === 0 || (parts.length === 1 && parts[0] === 'teams')) {
          return { mode: 'app', homeTab: 'client-teams', projectId: '', personId: '' };
        }

        if (parts[0] === 'teams' && parts.length === 2) {
          return { mode: 'app', homeTab: 'client-teams', projectId: parts[1], personId: '' };
        }

        if (parts.length === 1 && parts[0] === 'people') {
          return { mode: 'app', homeTab: 'people-overview', projectId: '', personId: '' };
        }

        if (parts[0] === 'people' && parts.length === 2) {
          return { mode: 'app', homeTab: 'people-overview', projectId: '', personId: parts[1] };
        }

        if (parts.length === 1 && parts[0] === 'invite') {
          return { mode: 'invite' };
        }

        if (parts.length === 1 && parts[0] === 'reset-password') {
          return { mode: 'reset-password' };
        }

        if (parts.length === 1 && parts[0] === 'admin') {
          return { mode: 'admin', adminTab: state.adminTab || 'people' };
        }

        if (parts[0] === 'admin' && parts.length === 2 && adminTabs.some((tab) => tab.id === parts[1])) {
          return { mode: 'admin', adminTab: parts[1] };
        }

        return null;
      }

      function applyAppRoute(pathname) {
        const route = parseAppRoute(pathname);
        if (!route) return false;

        if (route.mode === 'invite') {
          state.showAdmin = false;
          return true;
        }

        if (route.mode === 'reset-password') {
          state.showAdmin = false;
          return true;
        }

        if (route.mode === 'admin') {
          if (!canAccessAdmin()) {
            state.showAdmin = false;
            state.homeTab = 'client-teams';
            state.selectedProjectId = '';
            return true;
          }
          state.showAdmin = true;
          state.adminTab = route.adminTab || 'people';
          state.peopleOverviewModal.open = false;
          state.peopleOverviewModal.personId = null;
          return true;
        }

        state.showAdmin = false;
        state.homeTab = route.homeTab;

        if (!canViewPeopleOverview() && state.homeTab === 'people-overview') {
          state.homeTab = 'client-teams';
        }

        if (route.homeTab === 'client-teams' || state.homeTab === 'client-teams') {
          const hasProject = route.projectId && state.projectsPayload.projects.some((project) => String(project.id) === String(route.projectId));
          state.selectedProjectId = hasProject ? String(route.projectId) : '';
          state.peopleOverviewModal.open = false;
          state.peopleOverviewModal.personId = null;
          return true;
        }

        state.selectedProjectId = '';
        if (route.personId && state.people.some((person) => String(person.id) === String(route.personId) && personIsVisibleInNonAdmin(person))) {
          state.peopleOverviewModal.open = true;
          state.peopleOverviewModal.personId = String(route.personId);
        } else {
          state.peopleOverviewModal.open = false;
          state.peopleOverviewModal.personId = null;
        }

        return true;
      }

      function pathFromState() {
        if (state.inviteFlow?.active) {
          return `/invite?token=${encodeURIComponent(state.inviteFlow.token || '')}`;
        }

        if (state.resetPasswordFlow?.active) {
          return `/reset-password?token=${encodeURIComponent(state.resetPasswordFlow.token || '')}`;
        }

        if (state.showAdmin) {
          return state.adminTab === 'people' ? '/admin' : `/admin/${state.adminTab}`;
        }

        if (state.homeTab === 'people-overview' && canViewPeopleOverview()) {
          if (state.peopleOverviewModal.open && state.peopleOverviewModal.personId) {
            return `/people/${state.peopleOverviewModal.personId}`;
          }
          return '/people';
        }

        if (state.selectedProjectId) {
          return `/teams/${state.selectedProjectId}`;
        }

        return '/teams';
      }

      function navigateFromState(push = true) {
        const targetPath = pathFromState();
        if (window.location.pathname === targetPath) return;
        const method = push ? 'pushState' : 'replaceState';
        window.history[method]({}, '', targetPath);
      }

      window.setHomeTab = function setHomeTab(tabId) {
        if (tabId === 'people-overview' && !canViewPeopleOverview()) {
          state.homeTab = 'client-teams';
          navigateFromState();
          render();
          return;
        }
        state.homeTab = tabId;
        if (tabId === 'client-teams') {
          state.peopleOverviewModal.open = false;
          state.peopleOverviewModal.personId = null;
        }
        navigateFromState();
        render();
      };

      function adminStandaloneView() {
        const tabs = adminTabs.map((tab) => `<button class="rounded-lg border px-4 py-2 text-sm font-semibold ${state.adminTab === tab.id ? 'border-[#00d8ff] bg-[#00d8ff]/15 text-[#7cecff]' : 'border-slate-700 bg-slate-900 text-slate-300'}" onclick="setAdminTab('${tab.id}')">${i18n.t(tab.labelKey)}</button>`).join('');
        const body = state.adminTab === 'people' ? peopleView() : state.adminTab === 'clients' ? clientsView() : state.adminTab === 'projects' ? administrationProjectsView() : state.adminTab === 'access' ? accessManagementView() : configurationView();
        return `<div class="space-y-4"><div class="flex items-center justify-between"><h2 class="text-2xl font-bold">${i18n.t('admin.title')}</h2><button class="rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800" onclick="closeAdminStandalone()">${i18n.t('common.backToApp')}</button></div><div class="flex gap-2">${tabs}</div>${body}<footer class="mt-6 border-t border-slate-800 pt-4 text-sm text-slate-300"><div class="flex flex-wrap items-center gap-3"><button id="export-btn" class="rounded border border-slate-600 px-3 py-2 hover:bg-slate-800">${i18n.t('common.export')}</button><button id="import-btn" class="rounded border border-slate-600 px-3 py-2 hover:bg-slate-800">${i18n.t('common.import')}</button></div></footer></div>`;
      }

      window.setAdminTab = function setAdminTab(tabId) { if (!canAccessAdmin()) return; state.adminTab = tabId; state.showAdmin = true; navigateFromState(); render(); };
      window.closeAdminStandalone = function closeAdminStandalone() { state.showAdmin = false; navigateFromState(); render(); };
      window.continueWithCurrentAccess = async function continueWithCurrentAccess() {
        try {
          await loadData({ forceAppData: true });
          state.authRequired = false;
          render();
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };

      window.loginFromSplash = async function loginFromSplash(event) {
        event?.preventDefault();
        try {
          const email = String(document.getElementById('login-email')?.value || '').trim();
          const password = String(document.getElementById('login-password')?.value || '');
          await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
          });
          await loadData({ forceAppData: true });
          state.authRequired = false;
          showMessage(i18n.t('auth.login.success'));
          render();
        } catch (error) {
          showMessage(error.message, 'error');
        }
      };

      function render() {
        if (!canAccessAdmin()) state.showAdmin = false;

        const adminToggle = document.getElementById('admin-toggle');
        if (adminToggle) adminToggle.style.display = !needsLoginScreen() && canAccessAdmin() ? '' : 'none';
        const onboardingToggle = document.getElementById('onboarding-demo-start');
        if (onboardingToggle) onboardingToggle.style.display = needsLoginScreen() ? 'none' : '';
        const logoutButton = document.getElementById('auth-logout');
        if (logoutButton) logoutButton.classList.toggle('hidden', needsLoginScreen() || state.auth?.authSource !== 'session');

        if (state.inviteFlow?.active) {
          state.showAdmin = false;
          document.getElementById('view').innerHTML = inviteFlowView();
          document.getElementById('invite-activate-form')?.addEventListener('submit', window.submitInviteActivation);
        } else if (state.resetPasswordFlow?.active) {
          state.showAdmin = false;
          document.getElementById('view').innerHTML = resetPasswordFlowView();
          document.getElementById('reset-password-form')?.addEventListener('submit', window.submitResetPassword);
        } else if (needsLoginScreen()) {
          state.showAdmin = false;
          document.getElementById('view').innerHTML = loginScreenView();
          document.getElementById('login-form')?.addEventListener('submit', window.loginFromSplash);
          document.getElementById('forgot-password-form')?.addEventListener('submit', window.submitForgotPassword);
        } else if (state.showAdmin) {
          document.getElementById('view').innerHTML = adminStandaloneView();
        } else {
        if (!canViewPeopleOverview() && state.homeTab === 'people-overview') state.homeTab = 'client-teams';
        const peopleTab = canViewPeopleOverview()
          ? `<button class="inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold ${state.homeTab === 'people-overview' ? 'border-[#00d8ff] text-[#00d8ff]' : 'border-transparent text-slate-400 hover:text-slate-200'}" id="onboarding-tab-people-overview" onclick="setHomeTab('people-overview')"><span class="iconify text-base" data-icon="mdi:badge-account" aria-hidden="true"></span><span>${i18n.t('home.peopleOverview')}</span><span class="rounded-full bg-current/15 px-2 py-0.5 text-xs">${state.people.filter(personIsVisibleInNonAdmin).length}</span></button>`
          : '';
        const homeTabs = `<div class="mb-4 border-b border-slate-800"><nav class="-mb-px flex gap-6" aria-label="Homepage tabs"><button class="inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold ${state.homeTab === 'client-teams' ? 'border-[#00d8ff] text-[#00d8ff]' : 'border-transparent text-slate-400 hover:text-slate-200'}" id="onboarding-tab-client-teams" onclick="setHomeTab('client-teams')"><span class="iconify text-base" data-icon="mdi:karate" aria-hidden="true"></span><span>${i18n.t('home.clientTeams')}</span><span class="rounded-full bg-current/15 px-2 py-0.5 text-xs">${state.projectsPayload.projects.length}</span></button>${peopleTab}</nav></div>`;
        const homeContent = state.homeTab === 'people-overview' && canViewPeopleOverview() ? peopleOverviewView() : ownershipView();
        document.getElementById('view').innerHTML = homeTabs + homeContent;

        }

        document.getElementById('admin-panel').classList.add('hidden');

        bindInlineHandlers(document);
        bindForms();
        renderChallengeModal();
        renderAssignModal();
        renderUnassignModal();
        renderExportModal();
        renderImportModal();
        renderProjectStatusModal();
        renderProjectPriorityModal();
        renderPeopleOverviewModal();
        renderWorkloadModal();
        i18n.applyToDom(document);
        renderOnboardingDemo();
      }

      async function init() {
        try {
          await loadData();
          const localeSelect = document.getElementById('locale-select');
          if (localeSelect) localeSelect.value = i18n.getLocale();
          i18n.applyToDom(document);
        renderOnboardingDemo();

          bindHeaderActions();
          bindOnboardingDemoActions();
          bindFooterActions();
          bindChallengeModalActions();
          bindAssignModalActions();
          bindUnassignModalActions();
          bindExportModalActions();
          bindImportModalActions();
          bindProjectStatusModalActions();
          bindPeopleOverviewModalActions();
          bindWorkloadModalActions();
          bindAdminEntityModalActions();
          bindAdminUserModalActions();

          const params = new URLSearchParams(window.location.search || '');
          const inviteToken = String(params.get('token') || '').trim();
          if (window.location.pathname === '/invite') {
            state.inviteFlow.active = true;
            state.resetPasswordFlow.active = false;
            state.inviteFlow.token = inviteToken;
            await loadInviteFlow(inviteToken);
          } else if (window.location.pathname === '/reset-password') {
            state.inviteFlow.active = false;
            state.resetPasswordFlow.active = true;
            state.resetPasswordFlow.token = String(params.get('token') || '').trim();
          } else if (!needsLoginScreen() && !applyAppRoute(window.location.pathname)) {
            state.homeTab = 'client-teams';
            state.selectedProjectId = '';
            state.peopleOverviewModal.open = false;
            state.peopleOverviewModal.personId = null;
            state.showAdmin = false;
            state.adminTab = 'people';
            navigateFromState(false);
          }

          window.addEventListener('popstate', () => {
            if (window.location.pathname === '/invite') {
              const params = new URLSearchParams(window.location.search || '');
              state.inviteFlow.active = true;
              state.resetPasswordFlow.active = false;
              state.inviteFlow.token = String(params.get('token') || '').trim();
              loadInviteFlow(state.inviteFlow.token).then(() => render());
              return;
            }
            if (window.location.pathname === '/reset-password') {
              const params = new URLSearchParams(window.location.search || '');
              state.inviteFlow.active = false;
              state.resetPasswordFlow.active = true;
              state.resetPasswordFlow.token = String(params.get('token') || '').trim();
              render();
              return;
            }
            state.inviteFlow.active = false;
            state.resetPasswordFlow.active = false;
            if (!needsLoginScreen()) applyAppRoute(window.location.pathname);
            render();
          });

          render();
        } catch (error) {
          showMessage(error.message, 'error');
        }
      }

      init();
