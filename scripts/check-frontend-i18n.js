#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const jsTargets = [
  'public/js/app-main.js',
  'public/js/views-admin-projects.js',
  'public/js/views-clients.js',
  'public/js/views-people.js',
  'public/js/onboarding-tour.js'
];

const htmlTargets = ['public/index.html'];

const issues = [];

function lineNumberFor(content, index) {
  return content.slice(0, index).split('\n').length;
}

function checkStaticTemplateText(relPath, content) {
  const textNodeRegex = />\s*([^<\n]+)\s*</g;
  for (const match of content.matchAll(textNodeRegex)) {
    const text = String(match[1] || '').trim();
    if (!text) continue;
    if (!/[A-Za-z]/.test(text)) continue;
    if (text.includes('${')) continue;
    if (/^[-—•→←↑↓\d\s()%/.:+]+$/.test(text)) continue;
    if (/[{}=|`]/.test(text)) continue;
    issues.push({ file: relPath, line: lineNumberFor(content, match.index || 0), type: 'template-text', text });
  }
}

function checkImperativeStrings(relPath, content) {
  const patterns = [
    /showMessage\(\s*'([^']*[A-Za-z][^']*)'\s*[,)\]]/g,
    /showMessage\(\s*"([^"]*[A-Za-z][^"]*)"\s*[,)\]]/g,
    /window\.confirm\(\s*'([^']*[A-Za-z][^']*)'\s*\)/g,
    /window\.confirm\(\s*"([^"]*[A-Za-z][^"]*)"\s*\)/g
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      issues.push({ file: relPath, line: lineNumberFor(content, match.index || 0), type: 'imperative-string', text: match[1] });
    }
  }
}

function checkHtmlDataI18n(relPath, content) {
  const htmlTextRegex = /<(h1|h2|h3|h4|h5|h6|p|label|button|option|span)[^>]*>([^<]*[A-Za-z][^<]*)<\/(?:h1|h2|h3|h4|h5|h6|p|label|button|option|span)>/g;
  for (const match of content.matchAll(htmlTextRegex)) {
    const wholeTag = match[0];
    const text = String(match[2] || '').trim();
    if (!text) continue;
    if (/data-i18n=/.test(wholeTag) || /data-i18n-title=/.test(wholeTag)) continue;
    issues.push({ file: relPath, line: lineNumberFor(content, match.index || 0), type: 'html-data-i18n', text });
  }
}

for (const relPath of jsTargets) {
  const content = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
  checkStaticTemplateText(relPath, content);
  checkImperativeStrings(relPath, content);
}
for (const relPath of htmlTargets) {
  const content = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
  checkHtmlDataI18n(relPath, content);
}

if (issues.length) {
  console.error('Found non-localized frontend text.');
  for (const issue of issues) {
    console.error(`- ${issue.file}:${issue.line} [${issue.type}] ${issue.text}`);
  }
  process.exit(1);
}

console.log('Frontend localization guard passed.');
