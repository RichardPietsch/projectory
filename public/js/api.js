(function registerProjectoryApi(globalScope) {
  const CSRF_HEADER_NAME = 'x-csrf-token';
  const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  let csrfTokenCache = '';
  let csrfTokenPromise = null;

  function mergeHeaders(baseHeaders, overrideHeaders) {
    return {
      ...baseHeaders,
      ...(overrideHeaders || {})
    };
  }

  function normalizeMethod(options = {}) {
    return String(options.method || 'GET').trim().toUpperCase();
  }

  async function getCsrfToken() {
    if (csrfTokenCache) return csrfTokenCache;
    if (csrfTokenPromise) return csrfTokenPromise;

    csrfTokenPromise = fetch('/api/auth/csrf-token', {
      headers: { Accept: 'application/json' }
    })
      .then(async (response) => {
        if (!response.ok) return '';
        const payload = await response.json().catch(() => ({}));
        return String(payload?.token || '').trim();
      })
      .catch(() => '')
      .finally(() => {
        csrfTokenPromise = null;
      });

    csrfTokenCache = await csrfTokenPromise;
    return csrfTokenCache;
  }

  async function api(url, options = {}) {
    const method = normalizeMethod(options);
    const headers = mergeHeaders({ 'Content-Type': 'application/json' }, options.headers);

    if (MUTATING_METHODS.has(method) && !headers[CSRF_HEADER_NAME]) {
      const token = await getCsrfToken();
      if (token) {
        headers[CSRF_HEADER_NAME] = token;
      }
    }

    const response = await fetch(url, {
      ...options,
      method,
      headers
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Request failed.' }));
      if (response.status === 403 && String(data?.error || '').toLowerCase().includes('csrf')) {
        csrfTokenCache = '';
      }
      throw new Error(data.error || 'Request failed.');
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  globalScope.ProjectoryApi = {
    api
  };
})(window);
