const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = process.cwd();
const localeFiles = {
  en: path.join(ROOT, 'public/js/locales/en.js'),
  de: path.join(ROOT, 'public/js/locales/de.js')
};
const exceptionFile = path.join(ROOT, 'scripts/locale-key-exceptions.json');

function loadExceptions() {
  if (!fs.existsSync(exceptionFile)) {
    return { enOnly: new Set(), deOnly: new Set() };
  }

  const parsed = JSON.parse(fs.readFileSync(exceptionFile, 'utf8'));
  return {
    enOnly: new Set(parsed.enOnly || []),
    deOnly: new Set(parsed.deOnly || [])
  };
}

function loadLocaleMessages(localeCode, filePath) {
  const script = fs.readFileSync(filePath, 'utf8');
  const context = {
    window: {},
    globalScope: {}
  };
  context.window = context;
  context.globalScope = context;

  vm.createContext(context);
  vm.runInContext(script, context, { filename: filePath });

  const locales = context.ProjectoryLocales || {};
  const messages = locales[localeCode];
  if (!messages || typeof messages !== 'object') {
    throw new Error(`Locale ${localeCode} did not register messages from ${filePath}`);
  }

  return messages;
}

function groupByNamespace(keys) {
  const grouped = new Map();
  for (const key of keys) {
    const namespace = String(key).split('.').slice(0, 2).join('.') || 'root';
    if (!grouped.has(namespace)) grouped.set(namespace, []);
    grouped.get(namespace).push(key);
  }

  for (const entries of grouped.values()) {
    entries.sort();
  }

  return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function diffKeys(primary, other, allowed) {
  return [...primary].filter((key) => !other.has(key) && !allowed.has(key));
}

function findStaleExceptions(allowed, primary, other) {
  return [...allowed].filter((key) => primary.has(key) && other.has(key));
}

function printGroupedMismatch(title, keys) {
  if (keys.length === 0) return;
  console.error(`\n${title} (${keys.length})`);
  for (const [namespace, entries] of groupByNamespace(keys)) {
    console.error(`  - ${namespace}`);
    for (const key of entries) {
      console.error(`    • ${key}`);
    }
  }
}

function main() {
  const exceptions = loadExceptions();
  const enMessages = loadLocaleMessages('en', localeFiles.en);
  const deMessages = loadLocaleMessages('de', localeFiles.de);

  const enKeys = new Set(Object.keys(enMessages));
  const deKeys = new Set(Object.keys(deMessages));

  const enMissingInDe = diffKeys(enKeys, deKeys, exceptions.enOnly);
  const deMissingInEn = diffKeys(deKeys, enKeys, exceptions.deOnly);
  const staleEnOnlyExceptions = findStaleExceptions(exceptions.enOnly, enKeys, deKeys);
  const staleDeOnlyExceptions = findStaleExceptions(exceptions.deOnly, deKeys, enKeys);

  if (enMissingInDe.length === 0 && deMissingInEn.length === 0 && staleEnOnlyExceptions.length === 0 && staleDeOnlyExceptions.length === 0) {
    console.log(`Locale key check passed: en=${enKeys.size}, de=${deKeys.size}, exceptions(enOnly=${exceptions.enOnly.size}, deOnly=${exceptions.deOnly.size}).`);
    process.exit(0);
  }

  console.error('Locale key mismatch detected between en and de.');
  console.error('Review the groups below and either:');
  console.error('1) Add the missing translation key to the other locale, or');
  console.error('2) Add a temporary exception in scripts/locale-key-exceptions.json with justification in PR/ADR.');

  printGroupedMismatch('Missing in de (present in en)', enMissingInDe);
  printGroupedMismatch('Missing in en (present in de)', deMissingInEn);
  printGroupedMismatch('Stale enOnly exceptions (key exists in both locales)', staleEnOnlyExceptions);
  printGroupedMismatch('Stale deOnly exceptions (key exists in both locales)', staleDeOnlyExceptions);

  process.exit(1);
}

main();
