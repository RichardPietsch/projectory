#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(repoRoot, 'public');
const jsRoot = path.join(publicRoot, 'js');

const deprecatedClassPatterns = [
  /^(?:text|bg|border|ring|shadow|decoration|outline|placeholder|from|to|via|fill|stroke)-(?:zinc|slate|gray|stone|neutral|red|rose|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink)-/,
  /^(?:text|bg|border|ring)-\[(?:#|rgb|hsl)[^\]]+\]$/,
  /^(?:text|bg|border)-(?:white|black)$/
];

function listFiles(dirPath, predicate) {
  return fs.readdirSync(dirPath)
    .filter((name) => predicate(name))
    .map((name) => path.join(dirPath, name));
}

function extractClassTokens(source) {
  const tokens = new Set();
  const classAttrRegex = /class(?:Name)?\s*=\s*["'`]([^"'`]+)["'`]/g;
  const classListRegex = /classList\.(?:add|remove|toggle|replace)\(([^)]+)\)/g;
  const quotedTokenRegex = /["'`]([^"'`\s,]+)["'`]/g;

  let match;
  while ((match = classAttrRegex.exec(source)) !== null) {
    String(match[1] || '')
      .split(/\s+/)
      .filter(Boolean)
      .forEach((token) => tokens.add(token.trim()));
  }

  while ((match = classListRegex.exec(source)) !== null) {
    const args = String(match[1] || '');
    let argMatch;
    while ((argMatch = quotedTokenRegex.exec(args)) !== null) {
      const token = String(argMatch[1] || '').trim();
      if (token) tokens.add(token);
    }
  }

  return tokens;
}

const filesToScan = [
  ...listFiles(publicRoot, (name) => name.endsWith('.html')),
  ...listFiles(jsRoot, (name) => name.endsWith('.js'))
];

const findings = [];
for (const filePath of filesToScan) {
  const source = fs.readFileSync(filePath, 'utf8');
  const tokens = extractClassTokens(source);
  for (const token of tokens) {
    if (token.startsWith('ui-')) continue;
    if (token.includes('${')) continue;
    if (!deprecatedClassPatterns.some((pattern) => pattern.test(token))) continue;

    findings.push({
      file: path.relative(repoRoot, filePath),
      token
    });
  }
}

if (findings.length > 0) {
  console.log(`Deprecated CSS class usage detected: ${findings.length} potential match(es).`);
  for (const finding of findings) {
    console.log(`- ${finding.file}: ${finding.token}`);
  }
  process.exitCode = process.argv.includes('--strict') ? 1 : 0;
} else {
  console.log(`Deprecated CSS class usage check passed (${filesToScan.length} file(s) scanned).`);
}
