(function registerProjectoryApi(globalScope) {
  function mergeHeaders(baseHeaders, overrideHeaders) {
    return {
      ...baseHeaders,
      ...(overrideHeaders || {})
    };
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: mergeHeaders({ 'Content-Type': 'application/json' }, options.headers)
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Request failed.' }));
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
