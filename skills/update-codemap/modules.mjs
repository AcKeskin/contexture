// Which folder each file's module is named after. By default a module is a top-level folder,
// or a nested sub-project: a folder holding its own manifest (package.json, Cargo.toml, go.mod,
// pyproject.toml, *.csproj, *.asmdef, ...). The deepest one wins, so mcps/unity/server/ is its
// own module instead of part of mcps/. A folder with more than MAX_SIBLING_PROJECTS
// sub-projects under it (extensions/*, playground/**) becomes one module that lists them, so a big monorepo doesn't get hundreds of modules. A `## Modules` section
// in codemap.config.md replaces detection with folder patterns and/or a fixed depth.

import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_NAMES = new Set([
  'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'setup.py', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'composer.json', 'Package.swift', 'Gemfile',
]);
const MANIFEST_EXT = /\.(csproj|fsproj|vbproj|asmdef|gemspec)$/;
const MAX_SIBLING_PROJECTS = 12;
// Manifests under these folders are test data or samples, not sub-projects.
const NOT_A_PROJECT = /(^|\/)(tests?|__tests__|specs?|fixtures?|__fixtures__|testdata|test-data|examples?|samples?|e2e|snapshots?|__snapshots__)\//i;

export function isManifest(rel) {
  const base = rel.slice(rel.lastIndexOf('/') + 1);
  return MANIFEST_NAMES.has(base) || MANIFEST_EXT.test(base);
}

// `packages/*` → a regex for the folder path `packages/foo` (no trailing slash). `*` is one
// segment, `**` any number. Anchored at the project root.
export function dirPatternRegex(pattern) {
  const p = pattern.replace(/^\/+|\/+$/g, '');
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') { re += '.*'; i++; }
    else if (c === '*') re += '[^/]+';
    else if (c === '?') re += '[^/]';
    else if (/[.+^${}()|[\]\\]/.test(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp(`^${re}$`);
}

// Every folder (repo-relative, no trailing slash) that holds an indexed file, with ancestors.
function allDirs(files) {
  const dirs = new Set();
  for (const f of files) {
    let d = path.posix.dirname(f.rel);
    while (d !== '.' && !dirs.has(d)) { dirs.add(d); d = path.posix.dirname(d); }
  }
  return dirs;
}

// Module roots for this run, deepest first: [{ dir: 'a/b/', manifest: 'a/b/package.json' | null,
// projects: ['a/b/x/', ...] when it stands for sub-projects collapsed into it }]. `modules` is
// the parsed `## Modules` config ({ depth, patterns }); when it names anything, detection is
// off. A detected root needs 2+ indexed files to count.
export function detectModuleRoots(files, modules = { depth: 0, patterns: [] }) {
  const roots = new Map();
  if (modules.depth > 0 || modules.patterns.length) {
    const res = modules.patterns.map(dirPatternRegex);
    for (const d of allDirs(files)) {
      const depth = d.split('/').length;
      if (res.some((re) => re.test(d)) || depth === modules.depth) roots.set(d + '/', null);
    }
  } else {
    const count = new Map();
    for (const f of files) {
      let d = path.posix.dirname(f.rel);
      while (d !== '.') { count.set(d, (count.get(d) || 0) + 1); d = path.posix.dirname(d); }
    }
    for (const f of files) {
      if (!isManifest(f.rel) || NOT_A_PROJECT.test(f.rel)) continue;
      const d = path.posix.dirname(f.rel);
      if (d === '.' || (count.get(d) || 0) < 2) continue;
      if (!roots.get(d + '/')) roots.set(d + '/', f.rel); // first manifest seen names it
    }
    return collapseCrowded(roots);
  }
  return sortRoots([...roots.entries()].map(([dir, manifest]) => ({ dir, manifest })));
}

const sortRoots = (list) => list.sort((a, b) => b.dir.length - a.dir.length || a.dir.localeCompare(b.dir));

// Deepest first: a folder (not the project root) with more than MAX_SIBLING_PROJECTS roots
// under it, after its own sub-folders were collapsed, becomes one root standing for them.
function collapseCrowded(roots) {
  const cur = new Map([...roots].map(([dir, manifest]) => [dir, { dir, manifest, projects: null }]));
  const parents = new Set();
  for (const dir of roots.keys()) {
    let p = dir.replace(/[^/]+\/$/, '');
    while (p) { parents.add(p); p = p.replace(/[^/]+\/$/, ''); }
  }
  for (const p of [...parents].sort((a, b) => b.length - a.length || a.localeCompare(b))) {
    const under = [...cur.keys()].filter((d) => d !== p && d.startsWith(p));
    if (under.length <= MAX_SIBLING_PROJECTS) continue;
    const projects = under.flatMap((d) => [d, ...(cur.get(d).projects || [])]).sort();
    for (const d of under) cur.delete(d);
    cur.set(p, { dir: p, manifest: roots.get(p) || null, projects });
  }
  return sortRoots([...cur.values()].map((r) => (r.projects ? r : { dir: r.dir, manifest: r.manifest })));
}

// rel → its module name: the deepest root holding it, else its top-level folder, `./` at root.
export function makeModuleOf(roots) {
  const dirs = new Set(roots.map((r) => r.dir));
  return (rel) => {
    for (let ix = rel.lastIndexOf('/'); ix > 0; ix = rel.lastIndexOf('/', ix - 1)) {
      const d = rel.slice(0, ix + 1);
      if (dirs.has(d)) return d;
    }
    const ix = rel.indexOf('/');
    return ix < 0 ? './' : rel.slice(0, ix) + '/';
  };
}

// The one-line description a manifest declares, or '' (package.json/composer.json
// `description`, Cargo/pyproject `description = "..."`, csproj `<Description>`).
export function manifestDescription(root, manifestRel) {
  let text;
  try { text = fs.readFileSync(path.join(root, manifestRel), 'utf8'); } catch { return ''; }
  const base = manifestRel.slice(manifestRel.lastIndexOf('/') + 1);
  if (base.endsWith('.json')) {
    try {
      const d = JSON.parse(text.replace(/^\uFEFF/, '')).description;
      return typeof d === 'string' ? d.trim() : '';
    } catch { return ''; }
  }
  const m = base.endsWith('.toml') ? text.match(/^\s*description\s*=\s*"([^"\n]+)"/m)
    : /proj$/.test(base) ? text.match(/<Description>([^<]+)<\/Description>/) : null;
  return m ? m[1].trim() : '';
}
