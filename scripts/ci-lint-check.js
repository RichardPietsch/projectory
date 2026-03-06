const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['.git', 'node_modules']);
const JS_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);

const lintIssues = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    const relPath = path.relative(ROOT, fullPath);
    if (relPath === 'scripts/ci-lint-check.js') continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^<{7}|^={7}|^>{7}/.test(line)) {
        lintIssues.push(`${relPath}:${i + 1} contains unresolved merge conflict markers.`);
      }
    }

    const ext = path.extname(entry.name);
    if (JS_EXTENSIONS.has(ext)) {
      for (let i = 0; i < lines.length; i += 1) {
        if (/^\s*debugger\s*;?\s*$/.test(lines[i])) {
          lintIssues.push(`${relPath}:${i + 1} contains debugger statement.`);
        }
      }
    }
  }
}

walk(ROOT);

if (lintIssues.length) {
  console.error('Lint checks failed.');
  for (const issue of lintIssues) console.error(`- ${issue}`);
  console.error('\nFix instructions:');
  console.error('1) Remove debugger statements from JS files.');
  console.error('2) Resolve merge conflicts and remove marker lines.');
  process.exit(1);
}

console.log('Lint checks passed (no debugger statements or conflict markers found).');
