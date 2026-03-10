const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function bootstrapI18n({ search = '', storedLocale = null } = {}) {
  const storage = new Map();
  if (storedLocale) storage.set('projectory.locale', storedLocale);

  const context = {
    ProjectoryLocales: {},
    URL,
    URLSearchParams,
    navigator: { language: 'en-US' },
    location: {
      search,
      href: `https://example.test/${search}`
    },
    history: {
      state: null,
      lastUrl: null,
      replaceState(_state, _title, url) {
        this.lastUrl = url;
      }
    },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    },
    CustomEvent: class CustomEvent {
      constructor(name, init = {}) {
        this.name = name;
        this.detail = init.detail;
      }
    },
    dispatchEvent() {},
    document: {
      querySelectorAll() {
        return [];
      }
    }
  };

  context.window = context;
  context.globalScope = context;
  vm.createContext(context);

  const files = [
    'public/js/locales/en.js',
    'public/js/locales/de.js',
    'public/js/locales/pseudo.js',
    'public/js/i18n.js'
  ];

  for (const relPath of files) {
    const filePath = path.join(process.cwd(), relPath);
    vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
  }

  return { context, storage };
}

test('pseudo locale keeps interpolation tokens and adds markers', () => {
  const { context } = bootstrapI18n({ search: '?qaLocale=pseudo' });

  assert.equal(context.ProjectoryI18n.getLocale(), 'pseudo');
  const untranslatedTemplate = context.ProjectoryLocales.pseudo['onboarding.demo.stepIndicator'];
  assert.match(untranslatedTemplate, /\{\{current\}\}/);
  assert.match(untranslatedTemplate, /\{\{total\}\}/);

  const translated = context.ProjectoryI18n.t('onboarding.demo.stepIndicator', { current: 1, total: 10 });
  assert.match(translated, /1/);
  assert.match(translated, /10/);
  assert.match(translated, /^⟪¡¡ /);
  assert.match(translated, /!!!⟫$/);
});

test('qaLocale URL parameter overrides stored locale and is shareable', () => {
  const { context, storage } = bootstrapI18n({ search: '?qaLocale=pseudo', storedLocale: 'de' });

  assert.equal(context.ProjectoryI18n.getLocale(), 'pseudo');

  context.ProjectoryI18n.setLocale('en');
  assert.equal(storage.get('projectory.locale'), 'en');
  assert.equal(context.history.lastUrl, '/');

  context.ProjectoryI18n.setLocale('pseudo');
  assert.equal(context.history.lastUrl, '/?qaLocale=pseudo');
});
