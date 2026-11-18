// How a TS/JS project names its own files beyond relative paths: tsconfig/jsconfig
// `paths` and `baseUrl`, workspace package names, and `outDir` build output that maps
// back to `rootDir` source. Used by codemap.mjs to turn such imports into file edges.

import fs from 'node:fs';
import path from 'node:path';

// JSON with comments and trailing commas (tsconfig style) → value, or null.
export function parseJsonc(text) {
  text = text.replace(/^\uFEFF/, ''); // BOM, common on Windows
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i < 0) break;
      i++;
    } else {
      out += c;
    }
  }
  try {
    return JSON.parse(dropTrailingCommas(out));
  } catch {
    return null;
  }
}

// Removes a comma that only whitespace separates from `}` or `]`, outside strings.
function dropTrailingCommas(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === ',' && /^\s*[}\]]/.test(text.slice(i + 1, i + 200))) {
      continue;
    } else {
      out += c;
    }
  }
  return out;
}

const join = (dir, p) => path.posix.normalize(path.posix.join(dir, p)).replace(/^\.\/?$/, '').replace(/\/$/, '');

function readJson(root, rel) {
  try {
    return parseJsonc(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch {
    return null;
  }
}

// compilerOptions of a tsconfig, following a relative `extends` chain inside the repo.
// Path options are made repo-relative against the config that sets them.
function compilerOptions(root, rel, seen = new Set()) {
  if (seen.has(rel)) return {};
  seen.add(rel);
  const json = readJson(root, rel);
  if (!json) return {};
  const dir = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel);
  let base = {};
  const ext = typeof json.extends === 'string' && json.extends.startsWith('.') ? json.extends : null;
  if (ext) base = compilerOptions(root, join(dir, ext.endsWith('.json') ? ext : `${ext}.json`), seen);
  const o = json.compilerOptions || {};
  const own = {};
  if (typeof o.baseUrl === 'string') own.baseUrl = join(dir, o.baseUrl);
  if (o.paths && typeof o.paths === 'object') {
    own.paths = Object.entries(o.paths).filter(([, t]) => Array.isArray(t));
    own.pathsBase = own.baseUrl ?? base.baseUrl ?? dir;
  }
  if (typeof o.outDir === 'string') own.outDir = join(dir, o.outDir);
  if (typeof o.rootDir === 'string') own.rootDir = join(dir, o.rootDir);
  return { ...base, ...own };
}

// tsconfig.json / jsconfig.json and package.json files among `files` ({ rel }), read once.
export function loadProjectPaths(root, files) {
  const configs = [];
  const packages = [];
  for (const f of files) {
    const base = path.posix.basename(f.rel);
    const dir = path.posix.dirname(f.rel) === '.' ? '' : path.posix.dirname(f.rel);
    if (base === 'tsconfig.json' || base === 'jsconfig.json') {
      const o = compilerOptions(root, f.rel);
      configs.push({ dir, ...o, rootDir: o.rootDir ?? (o.outDir ? join(dir, 'src') : undefined) });
    } else if (base === 'package.json' && dir) {
      const json = readJson(root, f.rel);
      if (json && typeof json.name === 'string') {
        const entry = [json.source, json.types, json.module, json.main].find((v) => typeof v === 'string');
        packages.push({ name: json.name, dir, entry: entry ? join(dir, entry) : null });
      }
    }
  }
  // Nearest config first.
  configs.sort((a, b) => b.dir.length - a.dir.length);
  return { configs, packages };
}

const inside = (rel, dir) => dir === '' || rel === dir || rel.startsWith(dir + '/');

// Repo-relative candidates for a bare import, in the order to try them: the nearest
// config's `paths`, then its `baseUrl`, then a workspace package of that name.
export function aliasCandidates(target, sourceRel, projectPaths) {
  const out = [];
  for (const c of projectPaths.configs) {
    if (!inside(sourceRel, c.dir)) continue;
    for (const [pattern, targets] of c.paths || []) {
      const star = pattern.indexOf('*');
      let rest = null;
      if (star < 0) rest = pattern === target ? '' : null;
      else if (target.startsWith(pattern.slice(0, star)) && target.endsWith(pattern.slice(star + 1))) {
        rest = target.slice(star, target.length - (pattern.length - star - 1));
      }
      if (rest === null) continue;
      for (const t of targets) out.push(join(c.pathsBase, t.replace('*', rest)));
    }
    if (c.baseUrl !== undefined) out.push(join(c.baseUrl, target));
    break;
  }
  for (const p of projectPaths.packages) {
    if (target === p.name) {
      if (p.entry) out.push(p.entry, buildToSource(p.entry, projectPaths) ?? p.entry);
      out.push(join(p.dir, 'src/index'), join(p.dir, 'index'));
    } else if (target.startsWith(p.name + '/')) {
      const sub = target.slice(p.name.length + 1);
      out.push(join(p.dir, sub), join(p.dir, `src/${sub}`));
    }
  }
  return out.filter((c) => c && !c.startsWith('..'));
}

// `outDir/x.js` → `rootDir/x.js` for the config that owns that outDir, else null.
export function buildToSource(rel, projectPaths) {
  for (const c of projectPaths.configs) {
    if (c.outDir === undefined || c.rootDir === undefined || !inside(rel, c.outDir) || rel === c.outDir) continue;
    return c.rootDir ? `${c.rootDir}/${rel.slice(c.outDir.length + 1)}` : rel.slice(c.outDir.length + 1);
  }
  return null;
}
