#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

// Scope is expanded incrementally as surfaces are migrated.
const scopedFiles = [
  {
    path: 'public/js/app-shared-auth.js',
    startMarker: 'function loginScreenView() {',
    endMarker: 'window.submitForgotPassword = async function submitForgotPassword(event) {'
  },
  {
    path: 'public/js/views-people.js'
  },
  {
    path: 'public/js/views-admin-projects.js'
  },
  {
    path: 'public/js/views-clients.js'
  },
  {
    path: 'public/js/app-routing-ui.js',
    startMarker: 'function adminStandaloneView() {',
    endMarker: 'window.setAdminTab = function setAdminTab(tabId)'
  }
];

const prohibitedClassPatterns = [
  /^(?:text|bg|border|ring|shadow|decoration|outline|placeholder|from|to|via|fill|stroke)-(?:zinc|slate|gray|stone|neutral|red|rose|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink)-/,
  /^(?:text|bg|border|ring)-\[(?:#|rgb|hsl)[^\]]+\]$/,
  /^(?:text|bg|border)-(?:white|black)$/
];

function extractClassTokens(source) {
  const tokens = [];
  const classAttrRegex = /class\s*=\s*["'`]([^"'`]+)["'`]/g;
  const classNameRegex = /className\s*=\s*["'`]([^"'`]+)["'`]/g;

  for (const regex of [classAttrRegex, classNameRegex]) {
    let match;
    while ((match = regex.exec(source)) !== null) {
      const list = String(match[1] || '').split(/\s+/).filter(Boolean);
      for (const token of list) tokens.push(token.trim());
    }
  }

  return tokens;
}

const violations = [];
for (const scopedFile of scopedFiles) {
  const relPath = scopedFile.path;
  const absPath = path.join(repoRoot, relPath);
  const source = fs.readFileSync(absPath, 'utf8');
  const startIndex = source.indexOf(scopedFile.startMarker);
  const endIndex = source.indexOf(scopedFile.endMarker);
  const scopedSource = startIndex >= 0 && endIndex > startIndex
    ? source.slice(startIndex, endIndex)
    : source;
  const tokens = extractClassTokens(scopedSource);
  const unique = new Set(tokens);
  for (const token of unique) {
    if (token.startsWith('ui-')) continue;
    if (token.includes('${')) continue; // dynamic fragments handled via template semantics
    if (prohibitedClassPatterns.some((pattern) => pattern.test(token))) {
      violations.push({ file: relPath, token });
    }
  }
}

if (violations.length) {
  console.error('Frontend visual policy violations found (use semantic ui-* classes for styling):');
  for (const v of violations) {
    console.error(`- ${v.file}: ${v.token}`);
  }
  process.exit(1);
}

console.log(`Frontend visual policy check passed for ${scopedFiles.length} file(s).`);
