#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const themeCssPath = path.join(repoRoot, 'public/theme.css');
const scanFiles = [
  path.join(repoRoot, 'public/index.html'),
  ...fs.readdirSync(path.join(repoRoot, 'public/js'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(repoRoot, 'public/js', name))
];

function extractUiClassesFromCss(source) {
  return new Set((source.match(/\.ui-[a-z0-9-]+/g) || []).map((token) => token.slice(1)));
}

function extractUiClassesFromMarkup(source) {
  const classes = new Set();
  const attrRegex = /class(?:Name)?\s*=\s*["'`]([^"'`]+)["'`]/g;
  let match;

  while ((match = attrRegex.exec(source)) !== null) {
    const tokens = String(match[1] || '').split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (!token.startsWith('ui-')) continue;
      if (token.includes('${')) continue;
      classes.add(token.trim());
    }
  }

  return classes;
}

const themeCssSource = fs.readFileSync(themeCssPath, 'utf8');
const definedUiClasses = extractUiClassesFromCss(themeCssSource);

const missing = [];
for (const filePath of scanFiles) {
  const source = fs.readFileSync(filePath, 'utf8');
  const usedClasses = extractUiClassesFromMarkup(source);
  for (const className of usedClasses) {
    if (!definedUiClasses.has(className)) {
      missing.push({
        className,
        filePath: path.relative(repoRoot, filePath)
      });
    }
  }
}

if (missing.length > 0) {
  console.error('Frontend class contract check failed: ui-* classes used in markup without CSS definitions.');
  for (const problem of missing) {
    console.error(`- ${problem.filePath}: ${problem.className}`);
  }
  process.exit(1);
}

console.log(`Frontend class contract check passed (${scanFiles.length} file(s) scanned).`);
