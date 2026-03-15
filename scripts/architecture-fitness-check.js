const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const SRC_MODULES_DIR = path.join(ROOT, 'src', 'modules');

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

function parseLocalRequires(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const regex = /require\((['"])(\.{1,2}\/[^'"]+)\1\)/g;
  const imports = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[2]);
  }
  return imports;
}

function resolveImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, '/');
}

function getModuleContext(filePath) {
  const relative = rel(filePath);
  const match = relative.match(/^src\/modules\/([^/]+)\/(routes|service|repo|schema)\.js$/);
  if (!match) return null;
  return { moduleName: match[1], layer: match[2], relative };
}

function runFitnessChecks() {
  const files = walk(SRC_MODULES_DIR);
  const issues = [];

  for (const file of files) {
    const context = getModuleContext(file);
    if (!context) continue;

    const imports = parseLocalRequires(file);
    for (const specifier of imports) {
      const resolved = resolveImport(file, specifier);
      if (!resolved) continue;

      const target = getModuleContext(resolved);
      if (!target) continue;

      const sameModule = context.moduleName === target.moduleName;
      const edge = `${context.relative} -> ${rel(resolved)}`;

      if (!sameModule) {
        issues.push(`${edge} is forbidden: cross-module imports are not allowed between domain module layers.`);
        continue;
      }

      if (context.layer === 'routes') {
        const allowed = new Set(['service', 'schema']);
        if (!allowed.has(target.layer)) {
          issues.push(`${edge} is forbidden: routes layer may import only service/schema in the same module.`);
        }
      }

      if (context.layer === 'service') {
        const allowed = new Set(['repo', 'schema']);
        if (!allowed.has(target.layer)) {
          issues.push(`${edge} is forbidden: service layer may import only repo/schema in the same module.`);
        }
      }

      if (context.layer === 'repo') {
        issues.push(`${edge} is forbidden: repo layer must not depend on other module layers.`);
      }

      if (context.layer === 'schema') {
        issues.push(`${edge} is forbidden: schema layer must not depend on other module layers.`);
      }
    }
  }

  return issues;
}

const issues = runFitnessChecks();
if (issues.length > 0) {
  console.error('Architecture fitness checks failed.');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  console.error('\nFix instructions:');
  console.error('1) Keep module imports within their own domain folder.');
  console.error('2) Enforce layering: routes -> service/schema, service -> repo/schema, repo/schema -> no layer imports.');
  process.exit(1);
}

console.log('Architecture fitness checks passed (module dependency boundaries).');
