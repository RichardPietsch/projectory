(function initProjectorySafeDom(globalScope) {
  function setText(element, value) {
    if (!element) return;
    element.textContent = String(value ?? '');
  }

  function clearChildren(element) {
    if (!element) return;
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function appendOption(select, value, label, selected = false) {
    if (!select || !globalScope.document?.createElement) return null;
    const option = globalScope.document.createElement('option');
    option.value = String(value ?? '');
    setText(option, label);
    if (selected) option.selected = true;
    select.appendChild(option);
    return option;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  const api = {
    setText,
    clearChildren,
    appendOption,
    escapeHtml
  };

  globalScope.ProjectorySafeDom = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
