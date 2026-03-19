const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const targetDirArg = process.argv[2] || 'public/js';
const TARGET_DIR = path.resolve(ROOT, targetDirArg);
const ALLOW_MARKER = 'dom-safety-allow';

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineNumberFromIndex(text, index) {
  return text.slice(0, index).split('\n').length;
}

function hasAllowMarker(lines, lineNumber) {
  const current = lines[lineNumber - 1] || '';
  const previous = lines[lineNumber - 2] || '';
  return current.includes(ALLOW_MARKER) || previous.includes(ALLOW_MARKER);
}

function isLiteralAssignment(rhs) {
  const trimmed = rhs.trim();
  if (!trimmed) return false;

  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return true;
  }

  if (trimmed.startsWith('`') && trimmed.endsWith('`') && !trimmed.includes('${')) {
    return true;
  }

  return false;
}

function isEscapedAssignment(rhs) {
  return rhs.includes('safeDom.escapeHtml(') || rhs.includes('ProjectorySafeDom.escapeHtml(');
}

function checkFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const issues = [];

  const regex = /innerHTML\s*=\s*([\s\S]*?);/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const rhs = match[1];
    const lineNumber = lineNumberFromIndex(text, match.index);

    if (hasAllowMarker(lines, lineNumber)) continue;
    if (isLiteralAssignment(rhs)) continue;
    if (isEscapedAssignment(rhs)) continue;

    issues.push({
      file: path.relative(ROOT, filePath).replaceAll(path.sep, '/'),
      line: lineNumber,
      snippet: rhs.trim().split('\n')[0].slice(0, 120)
    });
  }

  return issues;
}

if (!fs.existsSync(TARGET_DIR) || !fs.statSync(TARGET_DIR).isDirectory()) {
  console.error(`Frontend DOM safety check failed: target directory not found: ${targetDirArg}`);
  process.exit(1);
}

const files = walk(TARGET_DIR);
const issues = files.flatMap(checkFile);

if (issues.length > 0) {
  console.error('Frontend DOM safety check failed.');
  console.error('Avoid assigning non-literal/non-escaped values to innerHTML in public/js.');
  console.error(`Use allow marker (${ALLOW_MARKER}) with rationale only for reviewed exceptions.`);
  for (const issue of issues) {
    console.error(`- ${issue.file}:${issue.line} -> ${issue.snippet}`);
  }
  process.exit(1);
}

console.log('Frontend DOM safety check passed.');
