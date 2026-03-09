(function registerLocalePseudo(globalScope) {
  const accentMap = {
    a: 'å',
    b: 'ƀ',
    c: 'ç',
    d: 'đ',
    e: 'ë',
    f: 'ƒ',
    g: 'ğ',
    h: 'ħ',
    i: 'ï',
    j: 'ĵ',
    k: 'ķ',
    l: 'ľ',
    m: 'ɱ',
    n: 'ñ',
    o: 'ø',
    p: 'þ',
    q: 'ʠ',
    r: 'ř',
    s: 'ş',
    t: 'ŧ',
    u: 'ü',
    v: 'ṽ',
    w: 'ŵ',
    x: 'ẋ',
    y: 'ÿ',
    z: 'ž'
  };

  function transformSegment(segment) {
    let out = '';
    for (const ch of segment) {
      const lower = ch.toLowerCase();
      const mapped = accentMap[lower];
      if (!mapped) {
        out += ch;
        continue;
      }

      const transformed = ch === lower ? mapped : mapped.toUpperCase();
      out += transformed;
      if ('aeiouAEIOU'.includes(ch)) {
        out += transformed;
      }
    }

    return out;
  }

  function pseudoLocalize(input) {
    const text = String(input || '');
    const parts = text.split(/(\{\{[^{}]+\}\})/g);
    const transformed = parts
      .map((part) => {
        if (!part) return part;
        if (part.startsWith('{{') && part.endsWith('}}')) return part;
        return transformSegment(part);
      })
      .join('');

    return `⟪¡¡ ${transformed} !!!⟫`;
  }

  const baseCatalog = globalScope.ProjectoryLocales?.en || {};
  const pseudoCatalog = {};
  for (const [key, value] of Object.entries(baseCatalog)) {
    pseudoCatalog[key] = pseudoLocalize(value);
  }

  pseudoCatalog['locale.pseudo'] = 'Pseudo (accented)';

  globalScope.ProjectoryLocales = {
    ...(globalScope.ProjectoryLocales || {}),
    pseudo: pseudoCatalog
  };
})(window);
