(function registerProjectoryI18n(globalScope) {
  const STORAGE_KEY = 'projectory.locale';
  const FALLBACK_LOCALE = 'en';
  const QA_LOCALE_QUERY_KEY = 'qaLocale';

  function getAvailableLocales() {
    return Object.keys(globalScope.ProjectoryLocales || {});
  }


  function normalizeLocale(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return '';
    if (['ps', 'pseudo', 'qps', 'qps-ploc'].includes(raw)) return 'pseudo';
    return raw;
  }

  function resolveQueryLocale() {
    const searchParams = new URLSearchParams(globalScope.location?.search || '');
    return normalizeLocale(searchParams.get(QA_LOCALE_QUERY_KEY) || searchParams.get('locale'));
  }

  function syncQaLocaleInUrl(locale) {
    if (!globalScope.history?.replaceState || !globalScope.location) return;

    const currentUrl = new URL(globalScope.location.href);
    if (locale === 'pseudo') {
      currentUrl.searchParams.set(QA_LOCALE_QUERY_KEY, 'pseudo');
    } else {
      currentUrl.searchParams.delete(QA_LOCALE_QUERY_KEY);
    }

    const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    globalScope.history.replaceState(globalScope.history.state, '', nextUrl);
  }

  function resolveInitialLocale() {
    const available = getAvailableLocales();
    const queryLocale = resolveQueryLocale();
    if (available.includes(queryLocale)) return queryLocale;

    const stored = normalizeLocale(globalScope.localStorage?.getItem(STORAGE_KEY));
    if (available.includes(stored)) return stored;

    const browserLocale = normalizeLocale(String(globalScope.navigator?.language || '').slice(0, 2));
    if (available.includes(browserLocale)) return browserLocale;

    return FALLBACK_LOCALE;
  }

  const i18nState = {
    locale: resolveInitialLocale()
  };

  function translateKey(key, localeOverride) {
    const locales = globalScope.ProjectoryLocales || {};
    const locale = localeOverride || i18nState.locale;
    return locales[locale]?.[key] ?? locales[FALLBACK_LOCALE]?.[key] ?? key;
  }

  function interpolate(template, params) {
    return String(template).replace(/\{\{\s*([^\s{}]+)\s*\}\}/g, (_m, token) => {
      return params && Object.prototype.hasOwnProperty.call(params, token) ? String(params[token]) : '';
    });
  }

  function t(key, params = null) {
    return interpolate(translateKey(key), params);
  }

  function applyToDom(root = document) {
    if (!root) return;

    root.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });

    root.querySelectorAll('[data-i18n-title]').forEach((node) => {
      node.title = t(node.dataset.i18nTitle);
    });

    root.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
      node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
    });

    root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      node.placeholder = t(node.dataset.i18nPlaceholder);
    });
  }

  function setLocale(nextLocale) {
    const locale = normalizeLocale(nextLocale);
    if (!getAvailableLocales().includes(locale)) {
      return false;
    }

    i18nState.locale = locale;
    globalScope.localStorage?.setItem(STORAGE_KEY, locale);
    syncQaLocaleInUrl(locale);
    applyToDom(document);
    globalScope.dispatchEvent(new CustomEvent('projectory:locale-changed', { detail: { locale } }));
    return true;
  }

  function getLocale() {
    return i18nState.locale;
  }

  globalScope.ProjectoryI18n = {
    t,
    setLocale,
    getLocale,
    getAvailableLocales,
    applyToDom
  };
})(window);
