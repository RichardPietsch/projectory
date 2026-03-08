const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['.git', 'node_modules']);
const CHECK_EXTENSIONS = new Set(['.js', '.json', '.yml', '.yaml', '.md', '.sql', '.sh']);

const issues = [];

function shouldCheck(fileName) {
  return CHECK_EXTENSIONS.has(path.extname(fileName));
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!shouldCheck(entry.name)) continue;

    const relPath = path.relative(ROOT, fullPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/\s+$/.test(line)) {
        issues.push(`${relPath}:${i + 1} has trailing whitespace.`);
      }
      if (/\t/.test(line)) {
        issues.push(`${relPath}:${i + 1} contains tab indentation.`);
      }
      if (/\r$/.test(line)) {
        issues.push(`${relPath}:${i + 1} contains CRLF line ending.`);
      }
    }

    if (content.length > 0 && !content.endsWith('\n')) {
      issues.push(`${relPath}: missing trailing newline at EOF.`);
    }
  }
}

walk(ROOT);

if (issues.length) {
  console.error('Formatting checks failed.');
  for (const issue of issues) console.error(`- ${issue}`);
  console.error('\nFix instructions:');
  console.error('1) Remove trailing spaces and tab characters.');
  console.error('2) Use LF line endings and ensure a final newline at EOF.');
  process.exit(1);
}

console.log('Formatting checks passed (whitespace and line endings are consistent).');
