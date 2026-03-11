const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['.git', 'node_modules']);
const JS_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
const MODULE_ROUTE_FILE = /src\/modules\/[^/]+\/routes\.js$/;
const MODULARIZED_PREFIXES = [
  '/api/people',
  '/api/clients',
  '/api/onboarding',
  '/api/projects',
  '/api/challenges',
  '/api/assignments'
];

const lintIssues = [];

function hasDirectSqlCall(line) {
  return /(pool|client)\.query\s*\(/.test(line);
}

function hasAppRouteDefinition(line) {
  return /app\.(get|post|put|delete|patch)\s*\(\s*['"`]/.test(line);
}

function checkBoundaryRules(relPath, lines) {
  if (MODULE_ROUTE_FILE.test(relPath)) {
    for (let i = 0; i < lines.length; i += 1) {
      if (hasDirectSqlCall(lines[i])) {
        lintIssues.push(`${relPath}:${i + 1} route files must not execute direct SQL; move SQL to repo layer.`);
      }
    }
  }

  if (relPath === 'src/app.js') {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!hasAppRouteDefinition(line)) continue;

      for (const prefix of MODULARIZED_PREFIXES) {
        if (line.includes(`'${prefix}`) || line.includes(`"${prefix}`) || line.includes(`\`${prefix}`)) {
          lintIssues.push(`${relPath}:${i + 1} defines ${prefix} route in app.js; this route family must live in a domain module.`);
          break;
        }
      }
    }
  }
}

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

      checkBoundaryRules(relPath, lines);
    }
  }
}

walk(ROOT);

if (lintIssues.length) {
  console.error('Boundary lint checks failed.');
  for (const issue of lintIssues) console.error(`- ${issue}`);
  console.error('\nFix instructions:');
  console.error('1) Remove debugger statements from JS files.');
  console.error('2) Resolve merge conflicts and remove marker lines.');
  console.error('3) Keep modularized domain routes out of src/app.js.');
  console.error('4) Keep SQL access in repo layer (not module route handlers).');
  process.exit(1);
}

console.log('Boundary lint checks passed (merge/conflict + architecture boundary checks).');
