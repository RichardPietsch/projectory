const state = window.ProjectoryState.createInitialState();
const i18n = window.ProjectoryI18n;

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
        const legacyMap = { green: { key: 'done', rank: 1, label: 'Done', colorHex: '#17B439' }, yellow: { key: 'in_progress', rank: 2, label: 'In Progress', colorHex: '#0375FD' }, blue: { key: 'in_progress', rank: 2, label: 'In Progress', colorHex: '#0375FD' }, red: { key: 'rework_needed', rank: 3, label: 'Rework needed', colorHex: '#E99C0C' }, white: { key: 'in_progress', rank: 2, label: 'In Progress', colorHex: '#0375FD' } };
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
      const CONFIGURATION_COLOR_OPTIONS = [
        { hex: PRIORITY_PRESET_MAP.gold.hex, style: PRIORITY_PRESET_MAP.gold.style },
        { hex: PRIORITY_PRESET_MAP.silver.hex, style: PRIORITY_PRESET_MAP.silver.style },
        { hex: PRIORITY_PRESET_MAP.bronze.hex, style: PRIORITY_PRESET_MAP.bronze.style },
        { hex: PRIORITY_PRESET_MAP.black.hex, style: PRIORITY_PRESET_MAP.black.style },
        { hex: '#EF4009' },
        { hex: '#E99C0C' },
        { hex: '#FAF407' },
        { hex: '#17B439' },
        { hex: '#15BAA6' },
        { hex: '#0375FD' },
        { hex: '#6C16F2' },
        { hex: '#B401FE' }
      ];
      state.configurationColorPicker = { open: false, kind: '', itemKey: '', selectedHex: '' };

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
        if (state.initialRegistration.required) {
          const registerBusy = state.initialRegistration.submitting
            ? i18n.t('auth.register.submitBusy')
            : i18n.t('auth.register.submit');
          const registerError = state.initialRegistration.error
            ? `<p class="mt-2 text-xs text-rose-300">${state.initialRegistration.error}</p>`
            : '';

          return `<div class="mx-auto mt-8 max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
            <h2 class="text-3xl font-bold">${i18n.t('auth.register.title')}</h2>
            <p class="mt-2 text-slate-300">${i18n.t('auth.register.subtitle')}</p>
            <div class="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">${i18n.t('auth.register.requirementsHint')}</div>
            <form id="initial-register-form" class="mt-4 rounded-xl border border-slate-800 bg-slate-800 p-4">
              <div class="grid gap-3 md:grid-cols-2">
                <label class="block text-sm text-slate-300">${i18n.t('auth.register.displayName')}
                  <input id="register-display-name" type="text" class="mt-1 w-full rounded bg-slate-950 p-2" required />
                </label>
                <label class="block text-sm text-slate-300">${i18n.t('auth.login.email')}
                  <input id="register-email" type="email" class="mt-1 w-full rounded bg-slate-950 p-2" placeholder="${i18n.t('auth.login.placeholders.email')}" required />
                </label>
                <label class="block text-sm text-slate-300">${i18n.t('auth.login.password')}
                  <input id="register-password" type="password" minlength="12" class="mt-1 w-full rounded bg-slate-950 p-2" placeholder="${i18n.t('auth.login.placeholders.password')}" required />
                </label>
                <label class="block text-sm text-slate-300">${i18n.t('auth.register.confirmPassword')}
                  <input id="register-password-confirm" type="password" minlength="12" class="mt-1 w-full rounded bg-slate-950 p-2" required />
                </label>
              </div>
              <button type="submit" class="mt-4 rounded bg-[#00d8ff] px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60" ${state.initialRegistration.submitting ? 'disabled' : ''}>${registerBusy}</button>
              ${registerError}
            </form>
          </div>`;
        }

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
              <form id="login-form" class="rounded-xl border border-slate-800 bg-slate-800 p-4">
                <h3 class="mb-3 text-lg font-semibold">${i18n.t('auth.login.formTitle')}</h3>
                <label class="mb-2 block text-sm text-slate-300">${i18n.t('auth.login.email')}
                  <input id="login-email" type="email" class="mt-1 w-full rounded bg-slate-950 p-2" placeholder="${i18n.t('auth.login.placeholders.email')}" required />
                </label>
                <label class="mb-3 block text-sm text-slate-300">${i18n.t('auth.login.password')}
                  <input id="login-password" type="password" class="mt-1 w-full rounded bg-slate-950 p-2" placeholder="${i18n.t('auth.login.placeholders.password')}" required />
                </label>
                <div class="flex gap-2">
                  <button type="submit" class="rounded bg-[#00d8ff] px-3 py-2 text-sm font-semibold text-slate-950">${i18n.t('auth.login.submit')}</button>
                </div>
              </form>

              <form id="forgot-password-form" class="rounded-xl border border-slate-800 bg-slate-800 p-4">
                <h3 class="mb-2 text-sm font-semibold text-slate-200">${i18n.t('auth.forgot.title')}</h3>
                <label class="block text-sm text-slate-300">${i18n.t('auth.forgot.emailLabel')}
                  <input id="forgot-password-email" type="email" class="mt-1 w-full rounded bg-slate-950 p-2" placeholder="${i18n.t('auth.login.placeholders.email')}" required />
                </label>
                <div class="mt-3">
                  <button type="submit" class="rounded border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800 disabled:opacity-60" ${state.forgotPassword.submitting ? 'disabled' : ''}>${forgotBusy}</button>
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
        const title = profile.displayName ? i18n.t('auth.invite.welcomeNamed', { name: profile.displayName }) : i18n.t('auth.invite.welcome');
        const subtitle = profile.email ? i18n.t('auth.invite.subtitleNamed', { email: profile.email }) : i18n.t('auth.invite.subtitle');
        const busyLabel = state.inviteFlow.submitting ? i18n.t('auth.invite.submitBusy') : i18n.t('auth.invite.submit');
        const errorHtml = state.inviteFlow.error ? `<p class="mt-3 text-sm text-rose-300">${state.inviteFlow.error}</p>` : '';

        return `<div class="mx-auto mt-8 max-w-xl rounded-2xl border border-slate-800 bg-slate-800 p-8 shadow-2xl">
          <h2 class="text-3xl font-bold">${title}</h2>
          <p class="mt-2 text-slate-300">${subtitle}</p>
          <p class="mt-1 text-xs text-slate-500">${i18n.t('auth.invite.tokenState', { state: state.inviteFlow.token ? i18n.t('common.loaded') : i18n.t('common.missing') })}</p>
          <form id="invite-activate-form" class="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <label class="mb-3 block text-sm text-slate-300" >${i18n.t('auth.login.password')}
              <input id="invite-password" type="password" class="mt-1 w-full rounded bg-slate-950 p-2" minlength="12" required />
            </label>
            <label class="mb-3 block text-sm text-slate-300" >${i18n.t('auth.register.confirmPassword')}
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
          state.inviteFlow.error = error.message || i18n.t('auth.invite.loadError');
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

        return `<div class="mx-auto mt-8 max-w-xl rounded-2xl border border-slate-800 bg-slate-800 p-8 shadow-2xl">
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

      window.submitInitialRegistration = async function submitInitialRegistration(event) {
        event?.preventDefault();
        const displayName = String(document.getElementById('register-display-name')?.value || '').trim();
        const email = String(document.getElementById('register-email')?.value || '').trim();
        const password = String(document.getElementById('register-password')?.value || '');
        const confirm = String(document.getElementById('register-password-confirm')?.value || '');

        if (password !== confirm) {
          state.initialRegistration.error = i18n.t('auth.reset.passwordsMismatch');
          render();
          return;
        }

        state.initialRegistration.submitting = true;
        state.initialRegistration.error = '';
        render();
        try {
          await api('/api/auth/register-initial-admin', {
            method: 'POST',
            body: JSON.stringify({ displayName, email, password })
          });
          state.initialRegistration.submitting = false;
          state.initialRegistration.required = false;
          await loadData({ forceAppData: true });
          state.authRequired = false;
          showMessage(i18n.t('auth.register.success'));
          render();
        } catch (error) {
          state.initialRegistration.submitting = false;
          state.initialRegistration.error = error.message || i18n.t('auth.register.genericError');
          await loadData();
          render();
        }
      };

