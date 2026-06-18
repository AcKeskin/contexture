#!/usr/bin/env node
// codemap-visualize.mjs — standalone implementation of the codemap-visualize skill.
// Spec source-of-truth: skills/codemap-visualize/SKILL.md.
// Reads .claude/codemap.md (does not rescan) and emits a human-facing UML-heavy
// technical document with topologically auto-layered module map, per-module
// class diagrams + subfolder-clustered file graphs, and a cross-module class
// relations diagram. Writes to .claude/codemap.diagrams.md and optionally to
// an Obsidian vault (single file or split-per-module).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULTS = {
  l1EdgeCap: 8,         // top-N outgoing module edges per node before "(+K more)" summary
  l2FileCap: 40,        // max files rendered per L2 module graph
  l2EdgeCap: 80,        // max edges per L2 module graph before truncation
  classMethodCap: 6,    // max methods to render per class in classDiagram
  callEdgeCap: 60,      // max call edges rendered per module call-graph
  renderer: 'elk',      // mermaid flowchart renderer hint
  splitPerModule: true, // vault output: one note per module + index
};

function parseArgs(argv) {
  const args = { root: null, vault: null, projectFolder: null, dryRun: false, quiet: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--vault') args.vault = argv[++i];
    else if (a === '--project-folder') args.projectFolder = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('usage: node skills/codemap-visualize/codemap-visualize.mjs [--root <dir>] [--vault <path>] [--project-folder <name>] [--dry-run] [--quiet]');
      process.exit(0);
    } else if (!args.root) args.root = a;
  }
  args.root = path.resolve(args.root || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  return args;
}

function log(args, msg) { if (!args.quiet) process.stdout.write(msg + '\n'); }

function readCodemap(root) {
  const p = path.join(root, '.claude', 'codemap.md');
  if (!fs.existsSync(p)) return null;
  return { path: p, text: fs.readFileSync(p, 'utf8') };
}

// Gitignore-style glob → regex. Mirrors codemap.mjs's configGlobToRegex.
function configGlobToRegex(pattern) {
  const isDir = pattern.endsWith('/');
  const p = isDir ? pattern.slice(0, -1) : pattern;
  let re = '';
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') { re += '.*'; i += 2; }
    else if (c === '*') { re += '[^/]*'; i++; }
    else if (c === '?') { re += '[^/]'; i++; }
    else if (/[.+^${}()|[\]\\]/.test(c)) { re += '\\' + c; i++; }
    else { re += c; i++; }
  }
  if (isDir) re += '(/.*)?';
  return new RegExp('(^|/)' + re + '$');
}

function loadVisualizeConfig(root) {
  const cfgPath = path.join(root, '.claude', 'codemap.config.md');
  const out = {
    skipPatterns: [],
    l1EdgeCap: DEFAULTS.l1EdgeCap,
    l2FileCap: DEFAULTS.l2FileCap,
    l2EdgeCap: DEFAULTS.l2EdgeCap,
    classMethodCap: DEFAULTS.classMethodCap,
    callEdgeCap: DEFAULTS.callEdgeCap,
    renderer: DEFAULTS.renderer,
    splitPerModule: DEFAULTS.splitPerModule,
  };
  if (!fs.existsSync(cfgPath)) return out;
  const lines = fs.readFileSync(cfgPath, 'utf8').split(/\r?\n/);
  let section = null;
  for (const raw of lines) {
    const h = raw.match(/^##\s+(.+?)\s*$/);
    if (h) { section = h[1].trim(); continue; }
    if (section !== 'Visualize') continue;
    const skip = raw.match(/^\s*-\s*skip:\s*`([^`]+)`\s*$/);
    if (skip) { out.skipPatterns.push(skip[1]); continue; }
    const kv = raw.match(/^\s*-\s*([a-z0-9-]+)\s*:\s*(.+?)\s*$/i);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const val = kv[2].trim();
    if (key === 'l1-edge-cap') out.l1EdgeCap = parseInt(val, 10) || out.l1EdgeCap;
    else if (key === 'l2-file-cap') out.l2FileCap = parseInt(val, 10) || out.l2FileCap;
    else if (key === 'l2-edge-cap') out.l2EdgeCap = parseInt(val, 10) || out.l2EdgeCap;
    else if (key === 'class-method-cap') out.classMethodCap = parseInt(val, 10) || out.classMethodCap;
    else if (key === 'call-edge-cap') out.callEdgeCap = parseInt(val, 10) || out.callEdgeCap;
    else if (key === 'renderer') out.renderer = /^elk$|^dagre$/i.test(val) ? val.toLowerCase() : out.renderer;
    else if (key === 'split-per-module') out.splitPerModule = /^true$/i.test(val);
  }
  return out;
}

// Parse the ## Class graph block. Entry format:
//   - <kind>: `Name` in `path/to/File.ext`
//     namespace: A.B.C
//     extends: BaseClass
//     implements: IFoo ; IBar
//     attributes: Foo ; Bar
//     fields: name1: Type1 ; name2: Type2
// Sub-lines are indented (any whitespace).
function parseClassGraph(lines, startIdx) {
  const classes = [];
  let current = null;
  let i = startIdx;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    // Section terminator: next `## ` heading.
    if (/^##\s+/.test(raw)) break;
    // Class entry leader.
    const lead = raw.match(/^-\s+(class|interface|struct|record|enum):\s+`([^`]+)`\s+in\s+`([^`]+)`\s*$/);
    if (lead) {
      current = {
        kind: lead[1],
        name: lead[2],
        file: lead[3],
        namespace: '',
        extends: [],
        implements: [],
        attributes: [],
        fields: [],
      };
      classes.push(current);
      continue;
    }
    if (!current) continue;
    // Sub-line key: value (indented).
    const sub = raw.match(/^\s+([a-z]+):\s*(.+?)\s*$/);
    if (!sub) continue;
    const key = sub[1].toLowerCase();
    const val = sub[2].trim();
    if (key === 'namespace') {
      current.namespace = val;
    } else if (key === 'extends') {
      current.extends = val.split(' ; ').map((s) => s.trim()).filter(Boolean);
    } else if (key === 'implements') {
      current.implements = val.split(' ; ').map((s) => s.trim()).filter(Boolean);
    } else if (key === 'attributes') {
      current.attributes = val.split(' ; ').map((s) => s.trim()).filter(Boolean);
    } else if (key === 'fields') {
      current.fields = val.split(' ; ').map((piece) => {
        const m = piece.match(/^([^:]+)\s*:\s*(.+)$/);
        if (!m) return { name: piece.trim(), type: '' };
        return { name: m[1].trim(), type: m[2].trim() };
      }).filter((f) => f.name);
    }
  }
  return { classes, nextIdx: i };
}

// Parse the ## Call graph block. Shape:
//   ## Call graph
//   _legend…_
//   ### mod/
//   - `file.ext::caller` → `callee`
//   - (+K more)
// Returns { byModule: Map<mod, [{file, caller, callee}]>, overflow: Map<mod, K> } and the
// index after the section. Edges are syntactic / name-matched (receiver types unresolved).
function parseCallGraph(lines, startIdx) {
  const byModule = new Map();
  const overflow = new Map();
  let mod = null;
  let i = startIdx;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (/^##\s+/.test(raw)) break; // next top-level section
    let m;
    if ((m = raw.match(/^###\s+(.+?)\s*$/))) { mod = m[1].trim(); if (!byModule.has(mod)) byModule.set(mod, []); continue; }
    if (!mod) continue;
    if ((m = raw.match(/^-\s+\(\+(\d+)\s+more\)\s*$/))) { overflow.set(mod, parseInt(m[1], 10)); continue; }
    if ((m = raw.match(/^-\s+`([^`]+)`\s+→\s+`([^`]+)`\s*$/))) {
      const left = m[1];
      const sep = left.indexOf('::');
      const file = sep >= 0 ? left.slice(0, sep) : '';
      const caller = sep >= 0 ? left.slice(sep + 2) : left;
      byModule.get(mod).push({ file, caller, callee: m[2] });
    }
  }
  return { callGraph: { byModule, overflow }, nextIdx: i };
}

function parseCodemap(text) {
  const lines = text.split(/\r?\n/);
  const sections = new Map();
  const groups = [];
  let callGraph = { byModule: new Map(), overflow: new Map() };
  let projectName = '';
  let lastUpdated = '';
  let currentSection = null;
  let currentGroup = null;
  let currentFile = null;
  let classes = [];
  // LLM-doc prose sections we surface on the human index.
  let overview = '';
  const moduleInfo = new Map(); // moduleName ("foo/") → { role, purpose, entry, publicSurface, dependsOn, importedBy, internals: [{path, purpose}] }
  let currentModuleInfo = null;

  // Sub-parser for `## Modules` (H3 per module, **Key:** value lines, plus
  // `**Internals:**` followed by a bulleted sub-list). Consumes lines until
  // it sees the next `## ` header. Returns the index of that header.
  function parseModulesSection(startIdx) {
    let j = startIdx;
    let cur = null;
    let inInternals = false;
    for (; j < lines.length; j++) {
      const r = lines[j];
      if (/^##\s+/.test(r)) break;
      let mm;
      if ((mm = r.match(/^###\s+(.+?)\s*$/))) {
        cur = { role: '', purpose: '', entry: '', publicSurface: '', dependsOn: '', importedBy: '', internals: [] };
        moduleInfo.set(mm[1].trim(), cur);
        inInternals = false;
        continue;
      }
      if (!cur) continue;
      if ((mm = r.match(/^\*\*Role:\*\*\s*(.+?)\s*$/))) { cur.role = mm[1]; inInternals = false; continue; }
      if ((mm = r.match(/^\*\*Purpose:\*\*\s*(.+?)\s*$/))) { cur.purpose = mm[1]; inInternals = false; continue; }
      if ((mm = r.match(/^\*\*Entry:\*\*\s*(.+?)\s*$/))) { cur.entry = mm[1]; inInternals = false; continue; }
      if ((mm = r.match(/^\*\*Public surface:\*\*\s*(.+?)\s*$/))) { cur.publicSurface = mm[1]; inInternals = false; continue; }
      if ((mm = r.match(/^\*\*Depends on:\*\*\s*(.+?)\s*$/))) { cur.dependsOn = mm[1]; inInternals = false; continue; }
      if ((mm = r.match(/^\*\*Imported by:\*\*\s*(.+?)\s*$/))) { cur.importedBy = mm[1]; inInternals = false; continue; }
      if (/^\*\*Internals:\*\*\s*$/.test(r)) { inInternals = true; continue; }
      if (inInternals && (mm = r.match(/^-\s+(.+?)\s+—\s+(.+?)\s*$/))) {
        cur.internals.push({ path: mm[1].trim(), purpose: mm[2].trim() });
        continue;
      }
    }
    return j;
  }

  // Sub-parser for the `## Overview` paragraph (single line, may wrap).
  function parseOverviewSection(startIdx) {
    let j = startIdx;
    const buf = [];
    for (; j < lines.length; j++) {
      const r = lines[j];
      if (/^##\s+/.test(r)) break;
      if (r.trim()) buf.push(r.trim());
    }
    overview = buf.join(' ');
    return j;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    let m;
    if ((m = raw.match(/^#\s+(?:Codemap|Architecture)\s+—\s+(.+?)\s*$/))) { projectName = m[1]; continue; }
    if ((m = raw.match(/^Last updated:\s*(.+?)\s*$/))) { lastUpdated = m[1]; continue; }
    if ((m = raw.match(/^##\s+(.+?)\s*$/))) {
      const header = m[1].trim();
      if (header === 'Class graph') {
        const { classes: cs, nextIdx } = parseClassGraph(lines, i + 1);
        classes = cs;
        i = nextIdx - 1;
        currentSection = null;
        currentGroup = null;
        currentFile = null;
        continue;
      }
      if (header === 'Overview') {
        i = parseOverviewSection(i + 1) - 1;
        currentSection = null;
        continue;
      }
      if (header === 'Modules') {
        i = parseModulesSection(i + 1) - 1;
        currentSection = null;
        continue;
      }
      if (header === 'Call graph') {
        const { callGraph: cg, nextIdx } = parseCallGraph(lines, i + 1);
        callGraph = cg;
        i = nextIdx - 1;
        currentSection = null;
        currentGroup = null;
        currentFile = null;
        continue;
      }
      if (header.endsWith('/')) {
        currentSection = 'group';
        currentGroup = { name: header, files: [] };
        groups.push(currentGroup);
        currentFile = null;
      } else {
        currentSection = header;
        if (!sections.has(header)) sections.set(header, []);
        currentGroup = null;
        currentFile = null;
      }
      continue;
    }
    if (currentSection === 'group' && currentGroup) {
      if ((m = raw.match(/^-\s+`([^`]+)`\s+—\s+(.+?)\s*$/))) {
        currentFile = { rel: m[1], purpose: m[2], exports: [] };
        currentGroup.files.push(currentFile);
        continue;
      }
      if (currentFile && (m = raw.match(/^\s+exports:\s*(.+?)\s*$/))) {
        currentFile.exports = m[1].split(' ; ').map((s) => s.trim()).filter(Boolean);
        continue;
      }
    } else if (currentSection && raw.startsWith('-')) {
      sections.get(currentSection).push(raw.replace(/^-\s*/, '').trim());
    }
  }

  // Conventions detected: `<Marker>: <N> instances — <note, comma examples>`
  const conventions = (sections.get('Conventions detected') || []).map((s) => {
    const mm = s.match(/^(.+?):\s*(\d+)\s*instances?\s*—\s*(.+)$/);
    if (!mm) return null;
    return { name: mm[1].trim(), count: parseInt(mm[2], 10), note: mm[3].trim() };
  }).filter(Boolean);

  // Hubs: `\`<file>\` — <N> importers, role: <purpose>`
  const hubs = (sections.get('Hubs') || []).map((s) => {
    const mm = s.match(/^`([^`]+)`\s+—\s+(\d+)\s+importers?,\s*role:\s*(.+)$/);
    if (!mm) return null;
    return { file: mm[1], count: parseInt(mm[2], 10), role: mm[3].trim() };
  }).filter(Boolean);

  const entryPoints = (sections.get('Entry points') || []).map((s) => {
    const m = s.match(/^`([^`]+)`\s+—\s+(.+)$/);
    return m ? { rel: m[1], role: m[2] } : null;
  }).filter(Boolean);

  const layers = (sections.get('Layers') || []).map((s) => {
    const m = s.match(/^([^:]+):\s*(.+)$/);
    return m ? { name: m[1].trim(), modules: m[2].split(',').map((x) => x.trim()).filter(Boolean) } : null;
  }).filter(Boolean);

  const dependencies = (sections.get('Dependencies') || []).map((s) => {
    const m = s.match(/^(\S+)\s+→\s+(.+)$/);
    if (!m) return null;
    const targets = m[2].split(',').map((part) => {
      const t = part.trim();
      const w = t.match(/^(\S+)\s*\((\d+)\)\s*$/);
      return w ? { to: w[1], weight: parseInt(w[2], 10) } : { to: t, weight: 1 };
    }).filter((x) => x.to);
    return { from: m[1].trim(), targets };
  }).filter(Boolean);

  const fileDeps = (sections.get('File deps') || []).map((s) => {
    const m = s.match(/^`([^`]+)`\s+→\s+(.+)$/);
    if (!m) return null;
    const targets = [...m[2].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
    return { from: m[1], to: targets };
  }).filter(Boolean);

  return { projectName, lastUpdated, groups, entryPoints, layers, dependencies, fileDeps, classes, overview, moduleInfo, conventions, hubs, callGraph };
}

function mermaidId(s) {
  return s.replace(/[^A-Za-z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'root';
}

function mermaidInit(renderer) {
  if (renderer === 'elk') return `%%{init: {"flowchart": {"defaultRenderer": "elk"}}}%%`;
  return '';
}

// ── Module-edge synthesis ────────────────────────────────────────────────────
//
// If parsed.dependencies is empty we can still derive module-level edges from
// the file-dep graph: for every file→file edge, walk up to the top-level module
// of each endpoint and count cross-module pairs.
function deriveModuleEdges(parsed) {
  if (parsed.dependencies.length) return parsed.dependencies;
  const moduleOf = new Map(); // rel → "mod/"
  for (const g of parsed.groups) {
    for (const f of g.files) moduleOf.set(f.rel, g.name);
  }
  const counts = new Map(); // from → Map<to, count>
  for (const fd of parsed.fileDeps) {
    const from = moduleOf.get(fd.from);
    if (!from) continue;
    for (const to of fd.to) {
      const tm = moduleOf.get(to);
      if (!tm || tm === from) continue;
      if (!counts.has(from)) counts.set(from, new Map());
      const bucket = counts.get(from);
      bucket.set(tm, (bucket.get(tm) || 0) + 1);
    }
  }
  const out = [];
  for (const [from, bucket] of counts.entries()) {
    out.push({ from, targets: [...bucket.entries()].map(([to, weight]) => ({ to, weight })) });
  }
  return out;
}

// ── Topological auto-layering ────────────────────────────────────────────────
//
// Cycle-tolerant: visit modules in DFS-postorder, assign layer = 1 + max layer
// of dependencies that have already settled. Modules on a cycle stabilize after
// a fixed number of passes.
function autoLayerModules(modules, edges) {
  const layer = new Map();
  for (const m of modules) layer.set(m, 0);
  const adj = new Map(); // from → Set<to>
  for (const m of modules) adj.set(m, new Set());
  for (const e of edges) {
    if (!adj.has(e.from)) continue;
    for (const t of e.targets) {
      if (modules.has(t.to) && t.to !== e.from) adj.get(e.from).add(t.to);
    }
  }
  // Iterate until stable or at most N rounds (cycle-safe).
  const N = modules.size + 2;
  for (let pass = 0; pass < N; pass++) {
    let changed = false;
    for (const m of modules) {
      let maxDep = -1;
      for (const dep of adj.get(m)) {
        const dl = layer.get(dep);
        if (dl > maxDep) maxDep = dl;
      }
      const next = maxDep < 0 ? 0 : maxDep + 1;
      if (next !== layer.get(m)) { layer.set(m, next); changed = true; }
    }
    if (!changed) break;
  }
  // Group: layer index → modules[]
  const byLayer = new Map();
  for (const [m, l] of layer.entries()) {
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l).push(m);
  }
  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
  return sortedLayers.map((idx) => ({ idx, modules: byLayer.get(idx).sort() }));
}

// ── Structure tree ───────────────────────────────────────────────────────────
//
// ASCII tree of top-level modules and their immediate subfolders, with a
// one-line purpose alongside each. Purpose for a folder = "(N files)" since the
// codemap doesn't carry per-folder narrative.
function renderStructure(parsed, projectName, skipRegexes) {
  const moduleSubfolders = new Map(); // module → Set<subfolder>
  const moduleFileCounts = new Map();
  const subfolderPurpose = new Map(); // "module/subfolder/" → purpose string from producer's Internals block
  const subfolderFileCount = new Map(); // "module/subfolder/" → count

  // Pre-index Internals lines from the LLM doc — they already carry the
  // synthesized one-liner per immediate subfolder.
  for (const [_modName, info] of parsed.moduleInfo) {
    for (const entry of info.internals || []) {
      // entry.path is like `unity-package/Editor` (no trailing slash sometimes)
      const key = entry.path.endsWith('/') ? entry.path : entry.path + '/';
      subfolderPurpose.set(key, entry.purpose);
    }
  }

  for (const g of parsed.groups) {
    if (skipRegexes.some((re) => re.test(g.name))) continue;
    if (g.name === './' || g.name === '.claude/') continue;
    const subs = new Set();
    let fileCount = 0;
    for (const f of g.files) {
      if (skipRegexes.some((re) => re.test(f.rel))) continue;
      fileCount++;
      const modPrefix = g.name; // e.g. "server/"
      if (!f.rel.startsWith(modPrefix)) continue;
      const remainder = f.rel.slice(modPrefix.length);
      const slash = remainder.indexOf('/');
      if (slash > 0) {
        const sub = remainder.slice(0, slash);
        subs.add(sub);
        const subKey = modPrefix + sub + '/';
        subfolderFileCount.set(subKey, (subfolderFileCount.get(subKey) || 0) + 1);
      }
    }
    moduleSubfolders.set(g.name, [...subs].sort());
    moduleFileCounts.set(g.name, fileCount);
  }

  const moduleNames = [...moduleSubfolders.keys()].sort();
  const lines = [];
  lines.push('```');
  lines.push(`${projectName}/`);
  for (let i = 0; i < moduleNames.length; i++) {
    const m = moduleNames[i];
    const isLastMod = i === moduleNames.length - 1;
    const modConnector = isLastMod ? '└──' : '├──';
    const padded = m.padEnd(20, ' ');
    const fileCount = moduleFileCounts.get(m) || 0;
    const modInfo = parsed.moduleInfo.get(m);
    const modSuffix = modInfo && modInfo.role ? `— ${modInfo.role}` : `— ${fileCount} file${fileCount === 1 ? '' : 's'}`;
    lines.push(`${modConnector} ${padded} ${modSuffix}`);
    const subs = moduleSubfolders.get(m) || [];
    for (let j = 0; j < subs.length; j++) {
      const s = subs[j];
      const isLastSub = j === subs.length - 1;
      const modPipe = isLastMod ? '    ' : '│   ';
      const subConnector = isLastSub ? '└──' : '├──';
      const subLabel = (s + '/').padEnd(16, ' ');
      const subKey = m + s + '/';
      const subPurpose = subfolderPurpose.get(subKey);
      const subFileCount = subfolderFileCount.get(subKey) || 0;
      const subSuffix = subPurpose ? `— ${subPurpose}` : `— ${subFileCount} file${subFileCount === 1 ? '' : 's'}`;
      lines.push(`${modPipe}${subConnector} ${subLabel} ${subSuffix}`);
    }
  }
  lines.push('```');
  return lines.join('\n');
}

// ── L1 Module map ────────────────────────────────────────────────────────────
function renderModuleMap(parsed, cfg, notes) {
  const allModules = new Set(parsed.groups.map((g) => g.name));
  const skipRegexes = cfg.skipPatterns.map(configGlobToRegex);
  const visibleModules = new Set([...allModules].filter((m) => !skipRegexes.some((re) => re.test(m))));

  const entryModules = new Set();
  for (const e of parsed.entryPoints) {
    const top = e.rel.split('/')[0] + '/';
    if (visibleModules.has(top)) entryModules.add(top);
  }

  // Layers: prefer declared (## Layers); else auto-layer topologically.
  const declaredLayers = parsed.layers.length > 0;
  const moduleEdges = deriveModuleEdges(parsed);
  let layered;
  if (declaredLayers) {
    layered = parsed.layers.map((l) => ({
      name: l.name,
      modules: l.modules
        .map((m) => (m.endsWith('/') ? m : m + '/'))
        .filter((m) => visibleModules.has(m)),
    }));
    // Drop empty layers; add un-layered modules to a synthetic "Unlayered" bucket.
    layered = layered.filter((l) => l.modules.length);
    const grouped = new Set(layered.flatMap((l) => l.modules));
    const unlayered = [...visibleModules].filter((m) => !grouped.has(m));
    if (unlayered.length) layered.push({ name: 'Unlayered', modules: unlayered.sort() });
  } else {
    const auto = autoLayerModules(visibleModules, moduleEdges);
    layered = auto.map((l) => ({ name: `Layer ${l.idx}`, modules: l.modules, idx: l.idx }));
  }
  const layerOfModule = new Map();
  for (const l of layered) for (const m of l.modules) layerOfModule.set(m, l.name);

  // Build edge map: from → Map<to, weight>.
  const edges = new Map();
  for (const d of moduleEdges) {
    if (!visibleModules.has(d.from)) continue;
    for (const t of d.targets) {
      if (!visibleModules.has(t.to)) continue;
      // Drop intra-layer edges — they're noise at L1.
      if (layerOfModule.get(d.from) && layerOfModule.get(d.from) === layerOfModule.get(t.to)) continue;
      if (!edges.has(d.from)) edges.set(d.from, new Map());
      const bucket = edges.get(d.from);
      bucket.set(t.to, (bucket.get(t.to) || 0) + t.weight);
    }
  }

  // Detect bidirectional pairs.
  const bidir = new Set();
  const cyclePairs = [];
  for (const [from, bucket] of edges.entries()) {
    for (const to of bucket.keys()) {
      const reverse = edges.get(to);
      if (reverse && reverse.has(from)) {
        const key = [from, to].sort().join('||');
        if (!bidir.has(key)) {
          bidir.add(key);
          cyclePairs.push([from, to].sort());
        }
      }
    }
  }

  // Top-N per source.
  const renderedEdges = [];
  const overflowSummaries = [];
  for (const [from, bucket] of edges.entries()) {
    const sorted = [...bucket.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
    const top = sorted.slice(0, cfg.l1EdgeCap);
    const rest = sorted.length - top.length;
    for (const [to, weight] of top) {
      const key = [from, to].sort().join('||');
      const isBidir = bidir.has(key);
      if (isBidir && from > to) continue;
      renderedEdges.push({ from, to, weight, bidir: isBidir });
    }
    if (rest > 0) overflowSummaries.push({ from, count: rest });
  }

  const lines = [];
  lines.push('```mermaid');
  const init = mermaidInit(cfg.renderer);
  if (init) lines.push(init);
  lines.push('graph LR');
  lines.push('  classDef entry fill:#fef3c7,stroke:#d97706,stroke-width:2px');
  lines.push('  classDef overflow fill:#f3f4f6,stroke:#9ca3af,stroke-dasharray: 4 2');

  for (const l of layered) {
    if (!l.modules.length) continue;
    lines.push(`  subgraph ${mermaidId(l.name)}["${l.name}"]`);
    for (const m of l.modules) {
      const id = mermaidId(m);
      lines.push(`    ${id}["${m}"]${entryModules.has(m) ? ':::entry' : ''}`);
    }
    lines.push('  end');
  }

  for (const e of renderedEdges) {
    const arrow = e.bidir ? '<-->' : '-->';
    const label = e.weight > 1 ? `|${e.weight}|` : '';
    lines.push(`  ${mermaidId(e.from)} ${arrow}${label} ${mermaidId(e.to)}`);
  }
  for (const o of overflowSummaries) {
    const oid = `${mermaidId(o.from)}_more`;
    lines.push(`  ${oid}["(+${o.count} more)"]:::overflow`);
    lines.push(`  ${mermaidId(o.from)} -.-> ${oid}`);
  }
  lines.push('```');

  if (visibleModules.size < allModules.size) {
    const hidden = [...allModules].filter((m) => !visibleModules.has(m));
    notes.push(`- L1: ${hidden.length} module(s) hidden by \`## Visualize\` skip: ${hidden.map((m) => `\`${m}\``).join(', ')}.`);
  }
  if (moduleEdges.length === 0) {
    if (parsed.fileDeps.length === 0) {
      notes.push('- Module map has no edges — source codemap has no `## Dependencies` and no `## File deps` to synthesise from. Re-run `update-codemap`.');
    } else {
      notes.push('- Module map has no edges — all file-level dependencies are intra-module (no cross-module imports detected).');
    }
  }
  if (parsed.layers.length === 0) notes.push('- Module map auto-layered topologically — no `## Layers` declared in `.claude/codemap.config.md`.');
  if (parsed.entryPoints.length === 0) notes.push('- Module map has no entry-point highlighting — no `## Entry points` in source codemap.');

  let cycleBlock = '';
  if (cyclePairs.length) {
    cycleBlock = '\n### Cycles detected\n\n';
    for (const [a, b] of cyclePairs) cycleBlock += `- \`${a}\` ↔ \`${b}\`\n`;
  }
  return lines.join('\n') + cycleBlock;
}

// ── L2 File graph (subfolder-clustered) ──────────────────────────────────────
function renderFileGraph(group, parsed, cfg) {
  const skipRegexes = cfg.skipPatterns.map(configGlobToRegex);
  const visibleFiles = group.files.filter((f) => !skipRegexes.some((re) => re.test(f.rel)));
  if (!visibleFiles.length) return { body: '_No files visible after skip patterns._', stats: { intra: 0, outbound: 0, files: 0 } };

  const fileSet = new Set(visibleFiles.map((f) => f.rel));
  const intraEdges = [];
  const outboundEdges = [];
  for (const fd of parsed.fileDeps) {
    if (!fileSet.has(fd.from)) continue;
    for (const to of fd.to) {
      if (fileSet.has(to)) intraEdges.push([fd.from, to]);
      else outboundEdges.push([fd.from, to]);
    }
  }

  const degree = new Map();
  for (const f of visibleFiles) degree.set(f.rel, 0);
  for (const [a, b] of intraEdges) {
    degree.set(a, (degree.get(a) || 0) + 1);
    degree.set(b, (degree.get(b) || 0) + 1);
  }
  for (const [a] of outboundEdges) degree.set(a, (degree.get(a) || 0) + 1);

  const ranked = [...visibleFiles].sort((a, b) => (degree.get(b.rel) || 0) - (degree.get(a.rel) || 0));
  const fileTruncated = ranked.length > cfg.l2FileCap;
  const filesToShow = fileTruncated ? ranked.slice(0, cfg.l2FileCap) : ranked;
  const visibleSet = new Set(filesToShow.map((f) => f.rel));

  const visibleIntra = intraEdges.filter(([a, b]) => visibleSet.has(a) && visibleSet.has(b));
  const visibleOutbound = outboundEdges.filter(([a]) => visibleSet.has(a));
  const totalEdges = visibleIntra.length + visibleOutbound.length;
  const edgeTruncated = totalEdges > cfg.l2EdgeCap;
  const intraToRender = edgeTruncated ? visibleIntra.slice(0, cfg.l2EdgeCap) : visibleIntra;
  const outboundToRender = edgeTruncated
    ? visibleOutbound.slice(0, Math.max(0, cfg.l2EdgeCap - intraToRender.length))
    : visibleOutbound;

  // Cluster files by immediate subfolder.
  const modPrefix = group.name;
  const bySubfolder = new Map(); // subfolder name → File[]
  const rootFiles = [];
  for (const f of filesToShow) {
    if (!f.rel.startsWith(modPrefix)) { rootFiles.push(f); continue; }
    const remainder = f.rel.slice(modPrefix.length);
    const slash = remainder.indexOf('/');
    if (slash < 0) { rootFiles.push(f); continue; }
    const sub = remainder.slice(0, slash);
    if (!bySubfolder.has(sub)) bySubfolder.set(sub, []);
    bySubfolder.get(sub).push(f);
  }

  const lines = [];
  lines.push('```mermaid');
  const init = mermaidInit(cfg.renderer);
  if (init) lines.push(init);
  lines.push('graph LR');
  lines.push('  classDef ghost fill:#f9fafb,stroke:#d1d5db,stroke-dasharray: 4 2,color:#6b7280');

  const idOf = new Map();
  const subKeys = [...bySubfolder.keys()].sort();
  for (const sub of subKeys) {
    lines.push(`  subgraph sub_${mermaidId(sub)}["${sub}/"]`);
    for (const f of bySubfolder.get(sub)) {
      const id = mermaidId(f.rel);
      idOf.set(f.rel, id);
      lines.push(`    ${id}["${path.posix.basename(f.rel)}"]`);
    }
    lines.push('  end');
  }
  for (const f of rootFiles) {
    const id = mermaidId(f.rel);
    idOf.set(f.rel, id);
    lines.push(`  ${id}["${path.posix.basename(f.rel)}"]`);
  }

  const ghosts = new Set();
  for (const [, b] of outboundToRender) {
    if (!ghosts.has(b)) {
      ghosts.add(b);
      const id = `ghost_${mermaidId(b)}`;
      lines.push(`  ${id}["${b}"]:::ghost`);
    }
  }
  if (filesToShow.length === 0) lines.push('  empty["(no files visible)"]');

  for (const [a, b] of intraToRender) lines.push(`  ${idOf.get(a)} --> ${idOf.get(b)}`);
  for (const [a, b] of outboundToRender) lines.push(`  ${idOf.get(a)} --> ghost_${mermaidId(b)}`);
  lines.push('```');

  const tail = [];
  if (fileTruncated) tail.push(`*${ranked.length - cfg.l2FileCap} file(s) omitted (cap ${cfg.l2FileCap}); ranked by edge degree.*`);
  if (edgeTruncated) tail.push(`*${totalEdges - cfg.l2EdgeCap} edge(s) omitted (cap ${cfg.l2EdgeCap}).*`);
  if (tail.length) { lines.push(''); lines.push(tail.join(' ')); }

  return { body: lines.join('\n'), stats: { intra: visibleIntra.length, outbound: visibleOutbound.length, files: visibleFiles.length } };
}

// ── Class diagram ────────────────────────────────────────────────────────────
//
// Render a Mermaid classDiagram for a set of in-scope classes. Inheritance and
// implementation edges are only drawn when both endpoints are in scope. Field
// composition edges (`o--`) draw to any class also in scope.
function renderClassDiagram(classesInScope, allClassNames, cfg, opts = {}) {
  if (!classesInScope.length) return null;

  // Deduplicate classes by name — when the same simple name appears in multiple
  // files (e.g. helper `StdioMcpClient` in several scripts), Mermaid merges them
  // into one node anyway and duplicate field/method lines compound. Keep first.
  const deduped = [];
  const seenNames = new Set();
  for (const c of classesInScope) {
    if (seenNames.has(c.name)) continue;
    seenNames.add(c.name);
    deduped.push(c);
  }
  const inScopeNames = new Set(deduped.map((c) => c.name));

  // Pre-pass: figure out which classes participate in relations or carry
  // fields. Orphans (no relations, no fields) render as empty boxes that pad
  // the diagram into a horizontal strip without adding information — drop them.
  const participatesInRelation = new Set();
  for (const c of deduped) {
    const childId = c.name;
    for (const ext of c.extends) {
      const parent = stripGenerics(ext);
      if (inScopeNames.has(parent)) { participatesInRelation.add(childId); participatesInRelation.add(parent); }
    }
    for (const iface of c.implements) {
      const i = stripGenerics(iface);
      if (inScopeNames.has(i)) { participatesInRelation.add(childId); participatesInRelation.add(i); }
    }
    for (const f of c.fields) {
      const t = stripGenerics(f.type);
      if (t && t !== c.name && inScopeNames.has(t)) { participatesInRelation.add(childId); participatesInRelation.add(t); }
    }
  }
  // Methods are intentionally not rendered inside class boxes (see comment
  // below), so "carrying structure" means having fields.
  const hasFields = (c) => c.fields.length > 0;
  const renderable = deduped.filter((c) => participatesInRelation.has(c.name) || hasFields(c));
  if (!renderable.length) return null;

  const lines = [];
  lines.push('```mermaid');
  lines.push('classDiagram');
  // Top-to-bottom layout so inheritance hierarchies render parent-above-child
  // instead of stretching horizontally into an unreadable strip.
  lines.push('  direction TB');

  for (const c of renderable) {
    lines.push(`  class ${sanitizeClassName(c.name)} {`);
    if (c.kind === 'interface') lines.push('    <<interface>>');
    else if (c.kind === 'enum') lines.push('    <<enumeration>>');
    else if (c.kind === 'struct') lines.push('    <<struct>>');
    else if (c.kind === 'record') lines.push('    <<record>>');
    const isAbstract = c.attributes.some((a) => /abstract/i.test(a)) ||
      c.extends.some((e) => /^Abstract/.test(e));
    if (isAbstract && c.kind === 'class') lines.push('    <<abstract>>');

    // Fields — show up to 8, dedupe by name. Use Mermaid's canonical
    // `name : Type` form (NOT `Type name` — older Mermaid versions in
    // Obsidian's bundle reject the latter, silently dropping all
    // subsequent relations).
    const seenFields = new Set();
    let fieldCount = 0;
    for (const f of c.fields) {
      if (seenFields.has(f.name)) continue;
      seenFields.add(f.name);
      const type = f.type ? sanitizeMermaidLabel(f.type) : '';
      const name = sanitizeMermaidLabel(f.name);
      lines.push(type ? `    +${name} : ${type}` : `    +${name}`);
      fieldCount++;
      if (fieldCount >= 8) break;
    }

    // Methods deliberately omitted from class boxes. They contain commas,
    // parens, type references, and `@params`-style annotations that frequently
    // break Mermaid's classDiagram parser — and when the parser bails, ALL
    // subsequent relations vanish from the rendered output. Methods are still
    // listed in the per-module Files block as exports; the class diagram's
    // job is the *structure* (inheritance / implementation / composition).
    lines.push('  }');
  }

  // Relations
  const emittedEdges = new Set();
  const renderableNames = new Set(renderable.map((c) => c.name));
  function emit(line) {
    if (emittedEdges.has(line)) return;
    emittedEdges.add(line);
    lines.push(line);
  }

  for (const c of renderable) {
    const childId = sanitizeClassName(c.name);
    for (const ext of c.extends) {
      const parent = stripGenerics(ext);
      if (!renderableNames.has(parent)) continue;
      emit(`  ${sanitizeClassName(parent)} <|-- ${childId} : extends`);
    }
    for (const iface of c.implements) {
      const i = stripGenerics(iface);
      if (!renderableNames.has(i)) continue;
      emit(`  ${sanitizeClassName(i)} <|.. ${childId} : implements`);
    }
    // Composition: field types that match an in-scope class.
    const composed = new Set();
    for (const f of c.fields) {
      const t = stripGenerics(f.type);
      if (!t || t === c.name) continue;
      if (renderableNames.has(t) && !composed.has(t)) {
        composed.add(t);
        emit(`  ${childId} "1" o-- "1" ${sanitizeClassName(t)}`);
      }
    }
  }

  lines.push('```');
  return lines.join('\n');
}

function stripGenerics(t) {
  if (!t) return '';
  // "List<Foo>" → "List"; "Mrtk3KnowledgeEntry" → "Mrtk3KnowledgeEntry".
  // For composition we want the inner type; but C# generic params aren't carried
  // through the codemap fields format (often it's just "List"), so we strip the
  // outer wrapper and try both. Caller already passes wrapped form.
  const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  return m ? m[1] : t;
}

function sanitizeClassName(s) {
  // Mermaid classDiagram doesn't accept non-identifier chars in class names.
  return s.replace(/[^A-Za-z0-9_]/g, '_');
}

function sanitizeMermaidLabel(s) {
  // Mermaid classDiagram is whitespace-sensitive around method signatures and
  // breaks on `<`, `>`, backticks, newlines, and `@` (which it treats as the
  // annotation/stereotype escape). Strip / substitute conservatively.
  return s
    .replace(/[`\n\r]/g, '')
    .replace(/@/g, '')
    .replace(/</g, '~')
    .replace(/>/g, '~')
    .trim();
}

// Cross-module class relations: extends/implements where the parent lives in a
// different module than the child.
function renderCrossModuleClassRelations(parsed) {
  const moduleOfClass = new Map(); // className → "mod/"
  const classByName = new Map();
  for (const c of parsed.classes) {
    const mod = c.file.split('/')[0] + '/';
    moduleOfClass.set(c.name, mod);
    classByName.set(c.name, c);
  }

  const lines = [];
  const declared = new Set();
  const edges = [];
  for (const c of parsed.classes) {
    const fromMod = moduleOfClass.get(c.name);
    for (const ext of c.extends) {
      const parent = stripGenerics(ext);
      const parentMod = moduleOfClass.get(parent);
      if (!parentMod || parentMod === fromMod) continue;
      declared.add(c.name);
      declared.add(parent);
      edges.push({ kind: 'extends', child: c.name, parent });
    }
    for (const iface of c.implements) {
      const i = stripGenerics(iface);
      const iMod = moduleOfClass.get(i);
      if (!iMod || iMod === fromMod) continue;
      declared.add(c.name);
      declared.add(i);
      edges.push({ kind: 'implements', child: c.name, parent: i });
    }
  }
  if (!edges.length) return null;

  // Cap: a single classDiagram with hundreds of nodes renders as an unreadable
  // horizontal smear in Obsidian/Mermaid. Keep the top-N classes by cross-module edge
  // degree (the genuine hubs — base classes / interfaces with many implementers), drop
  // edges whose endpoints don't both survive, and note the truncation. N is generous but
  // bounded so the diagram stays legible. Same spirit as l2-file-cap / class-method-cap.
  const CROSS_CLASS_CAP = 40;
  let keep = declared;
  let truncatedFrom = 0;
  if (declared.size > CROSS_CLASS_CAP) {
    const degree = new Map();
    for (const name of declared) degree.set(name, 0);
    for (const e of edges) {
      degree.set(e.parent, (degree.get(e.parent) || 0) + 1);
      degree.set(e.child, (degree.get(e.child) || 0) + 1);
    }
    const ranked = [...declared].sort((a, b) =>
      (degree.get(b) - degree.get(a)) || a.localeCompare(b));
    truncatedFrom = declared.size;
    keep = new Set(ranked.slice(0, CROSS_CLASS_CAP));
  }
  const visibleEdges = edges.filter((e) => keep.has(e.parent) && keep.has(e.child));
  if (!visibleEdges.length) return null;
  // After dropping cross-cap edges, only declare nodes that still participate in an edge.
  const stillUsed = new Set();
  for (const e of visibleEdges) { stillUsed.add(e.parent); stillUsed.add(e.child); }

  lines.push('```mermaid');
  lines.push('classDiagram');
  lines.push('  direction TB');
  for (const name of stillUsed) {
    const c = classByName.get(name);
    const mod = moduleOfClass.get(name) || '';
    lines.push(`  class ${sanitizeClassName(name)} {`);
    if (c && c.kind === 'interface') lines.push('    <<interface>>');
    else if (c && c.kind === 'struct') lines.push('    <<struct>>');
    else if (c && c.kind === 'enum') lines.push('    <<enumeration>>');
    lines.push(`    +${sanitizeMermaidLabel(mod.replace(/\/$/, ''))}`);
    lines.push('  }');
  }
  const emitted = new Set();
  for (const e of visibleEdges) {
    const arrow = e.kind === 'extends' ? '<|--' : '<|..';
    const line = `  ${sanitizeClassName(e.parent)} ${arrow} ${sanitizeClassName(e.child)} : ${e.kind}`;
    if (emitted.has(line)) continue;
    emitted.add(line);
    lines.push(line);
  }
  lines.push('```');
  if (truncatedFrom) {
    lines.push('');
    lines.push(`*Showing the ${stillUsed.size} most-connected of ${truncatedFrom} classes with cross-module relations (ranked by edge degree). The full set is in the source codemap's \`## Class graph\`.*`);
  }
  return lines.join('\n');
}

// ── Call graph ─────────────────────────────────────────────────
//
// One Mermaid flowchart per module of caller→callee edges, reusing the per-module
// subgraph-cluster + degree-ranking + (+K more) overflow machinery from renderFileGraph.
// Edges are SYNTACTIC / name-matched (receiver types unresolved) — the prose legend says
// so, and the diagram never claims otherwise. A caller is qualified `file::name` so the
// same method name in two files doesn't collapse; the callee is a bare name (its
// definition site is unresolved by design), drawn as a shared target node per module.
function renderCallGraph(parsed, cfg) {
  const cg = parsed.callGraph;
  if (!cg || !cg.byModule || !cg.byModule.size) return null;
  const out = [];
  out.push('_Syntactic / name-matched call edges: caller → callee by bare name. Receiver ' +
    'types are unresolved, so edges are best-effort matches, not resolved ground truth. ' +
    'Project-internal edges (callee resolves to a defined symbol) are prioritised; external/builtin ' +
    'callees are demoted as unresolved._');
  out.push('');
  // Reconstruct the project-defined symbol set from what the codemap exposes: every `caller`
  // in the call graph is a project-defined function/method, and every parsed class name is a
  // declared type. This mirrors the codemap's resolved-first ranking so the rendered diagram
  // leads with project-internal edges instead of builtin noise. It is a SUBSET of the codemap's
  // full `defines` set (non-exported leaf functions that never appear as a caller aren't visible
  // here) — but the codemap already emitted edges resolved-first, so this only has to avoid
  // re-scrambling that order; a slightly smaller set still keeps true builtins in the tail.
  const projectSymbols = new Set();
  for (const edges of cg.byModule.values()) for (const e of edges) if (e.caller && e.caller !== '<module>') projectSymbols.add(e.caller);
  for (const c of (parsed.classes || [])) if (c.name) projectSymbols.add(c.name);

  for (const mod of [...cg.byModule.keys()].sort()) {
    const edges = cg.byModule.get(mod);
    if (!edges.length) continue;
    // Rank project-internal first (callee resolves to a project symbol), then by callee
    // in-degree so the genuine hubs survive the per-module cap.
    const calleeDegree = new Map();
    for (const e of edges) calleeDegree.set(e.callee, (calleeDegree.get(e.callee) || 0) + 1);
    const ranked = [...edges].sort((a, b) =>
      (Number(projectSymbols.has(b.callee)) - Number(projectSymbols.has(a.callee))) ||
      (calleeDegree.get(b.callee) - calleeDegree.get(a.callee)) ||
      a.caller.localeCompare(b.caller) || a.callee.localeCompare(b.callee));
    const shown = ranked.slice(0, cfg.callEdgeCap);
    const parseOverflow = cg.overflow.get(mod) || 0;
    const renderOverflow = ranked.length - shown.length;

    const lines = [];
    lines.push('```mermaid');
    const init = mermaidInit(cfg.renderer);
    if (init) lines.push(init);
    lines.push('graph LR');
    // Caller node id = file::caller (unique per file); callee node id = callee name.
    const callerId = (e) => mermaidId(`c_${e.file}__${e.caller}`);
    const calleeId = (e) => mermaidId(`t_${e.callee}`);
    const declared = new Set();
    for (const e of shown) {
      const cid = callerId(e);
      if (!declared.has(cid)) { declared.add(cid); lines.push(`  ${cid}["${e.caller}"]`); }
      const tid = calleeId(e);
      if (!declared.has(tid)) { declared.add(tid); lines.push(`  ${tid}(["${e.callee}"])`); }
    }
    for (const e of shown) lines.push(`  ${callerId(e)} --> ${calleeId(e)}`);
    lines.push('```');

    out.push(`#### ${mod}`);
    out.push('');
    out.push(lines.join('\n'));
    const omitted = renderOverflow + parseOverflow;
    if (omitted > 0) {
      out.push('');
      out.push(`*${omitted} more call edge(s) omitted (cap ${cfg.callEdgeCap}); ranked by callee in-degree. Full set in the source codemap's \`## Call graph\`.*`);
    }
    out.push('');
  }
  return out.length > 2 ? out.join('\n') : null;
}

// ── Module section rendering ─────────────────────────────────────────────────
function buildExportsByFile(parsed) {
  const m = new Map();
  for (const g of parsed.groups) {
    for (const f of g.files) {
      if (f.exports.length) m.set(f.rel, f.exports);
    }
  }
  return m;
}

function renderModuleSection(group, parsed, cfg, exportsByFile) {
  const skipRegexes = cfg.skipPatterns.map(configGlobToRegex);
  const visibleFiles = group.files.filter((f) => !skipRegexes.some((re) => re.test(f.rel)));
  const publicSurfaceCount = visibleFiles.reduce((sum, f) => sum + f.exports.length, 0);
  const classesInModule = parsed.classes.filter((c) => c.file.startsWith(group.name));

  const out = [];
  out.push(`### ${group.name}`);
  out.push('');
  // Short paragraph — purpose + counts.
  out.push(`${visibleFiles.length} file${visibleFiles.length === 1 ? '' : 's'}, ${publicSurfaceCount} exported symbol${publicSurfaceCount === 1 ? '' : 's'}, ${classesInModule.length} declared type${classesInModule.length === 1 ? '' : 's'}.`);
  out.push('');

  const fg = renderFileGraph(group, parsed, cfg);
  out.push('#### File graph');
  out.push('');
  out.push(fg.body);
  out.push('');

  if (classesInModule.length) {
    // Obsidian's Mermaid renderer silently bails on very large classDiagrams
    // (~100+ classes / 800+ lines). Split by immediate sub-folder so each
    // diagram stays readable and renderable.
    const CLASS_DIAGRAM_SPLIT_THRESHOLD = 25;
    const allClassNames = new Set(parsed.classes.map((c) => c.name));

    if (classesInModule.length <= CLASS_DIAGRAM_SPLIT_THRESHOLD) {
      const cd = renderClassDiagram(classesInModule, allClassNames, cfg, { exportsByFile });
      if (cd) {
        out.push('#### Class diagram');
        out.push('');
        out.push(cd);
        out.push('');
      }
    } else {
      // Bucket by immediate sub-folder relative to the module root.
      // e.g. classes in `unity-package/Editor/Tools/Mrtk3/Foo.cs` → subfolder `Editor/Tools/Mrtk3`.
      // We use the *full intra-module path minus the basename* so each leaf folder gets its own bucket.
      const buckets = new Map();
      for (const c of classesInModule) {
        const intra = c.file.slice(group.name.length); // drop "module/" prefix
        const parts = intra.split('/');
        const sub = parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';
        if (!buckets.has(sub)) buckets.set(sub, []);
        buckets.get(sub).push(c);
      }

      out.push('#### Class diagrams');
      out.push('');
      out.push(`Split by sub-folder — ${buckets.size} group${buckets.size === 1 ? '' : 's'} (Obsidian Mermaid struggles past ~${CLASS_DIAGRAM_SPLIT_THRESHOLD} classes per diagram). Relations across sub-folders surface in the *Cross-module class relations* section at the top of the codemap.`);
      out.push('');

      // Build a quick lookup so each bucket can pull in parent classes
      // referenced by its members (extends/implements) — without this, the
      // IUnityMcpTool fan would disappear when split by sub-folder.
      const classByName = new Map(classesInModule.map((c) => [c.name, c]));

      const sortedBuckets = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [sub, classes] of sortedBuckets) {
        // Pull in parents referenced by this bucket's classes so inheritance
        // arrows render even when parent lives in a different sub-folder.
        // Parent gets shown as a tiny stub in this diagram (its members appear
        // properly in its own home-bucket diagram).
        const extended = new Set(classes.map((c) => c.name));
        for (const c of classes) {
          for (const ext of c.extends) {
            const parent = stripGenerics(ext);
            if (classByName.has(parent)) extended.add(parent);
          }
          for (const iface of c.implements) {
            const i = stripGenerics(iface);
            if (classByName.has(i)) extended.add(i);
          }
        }
        const allInDiagram = [...extended].map((n) => classByName.get(n)).filter(Boolean);
        const cd = renderClassDiagram(allInDiagram, extended, cfg, { exportsByFile });
        if (!cd) continue;
        out.push(`##### ${sub === '(root)' ? `${group.name} (module root)` : `${group.name}${sub}/`}`);
        out.push('');
        out.push(`${classes.length} type${classes.length === 1 ? '' : 's'} in this sub-folder${allInDiagram.length > classes.length ? ` (+ ${allInDiagram.length - classes.length} referenced parent${allInDiagram.length - classes.length === 1 ? '' : 's'})` : ''}.`);
        out.push('');
        out.push(cd);
        out.push('');
      }
    }
  }

  if (visibleFiles.length) {
    out.push('#### Files');
    out.push('');
    for (const f of visibleFiles) {
      out.push(`- \`${f.rel}\` — ${f.purpose}`);
      for (const e of f.exports) out.push(`  - ${e}`);
    }
    out.push('');
  }

  return { name: group.name, body: out.join('\n'), stats: { ...fg.stats, classes: classesInModule.length } };
}

// ── Helpers for index-level prose sections ───────────────────────────────────
function renderOverviewBlock(parsed) {
  if (!parsed.overview) return '';
  return `## Overview\n\n${parsed.overview}\n`;
}

function renderConventionsBlock(parsed) {
  if (!parsed.conventions || !parsed.conventions.length) return '';
  const lines = ['## Conventions detected', ''];
  for (const c of parsed.conventions) {
    lines.push(`- **${c.name}** — ${c.count} instances. ${c.note}`);
  }
  return lines.join('\n') + '\n';
}

function renderHubsBlock(parsed) {
  if (!parsed.hubs || !parsed.hubs.length) return '';
  const lines = ['## Hubs', '', '_Files imported by many others. Treat changes here with extra care._', ''];
  for (const h of parsed.hubs) {
    lines.push(`- \`${h.file}\` — ${h.count} importer${h.count === 1 ? '' : 's'}. ${h.role}`);
  }
  return lines.join('\n') + '\n';
}

// Build the `## Modules` index list. For each module section, emit:
//   - [[link|name]] — counts
//     - **Role:** ...
//     - **Purpose:** ...
//     - **Entry:** ...
//     - **Public surface:** ...
//     - **Depends on:** ...     (omitted if "(none)")
//     - **Imported by:** ...    (omitted if "(none)")
// When the LLM doc didn't synthesize info for a module (e.g. ./ or .claude/), fall back to counts-only.
function renderModulesIndexList(parsed, moduleSections, projectSlug, useWikilinks) {
  const lines = ['## Modules', ''];
  for (const s of moduleSections) {
    const slug = slugify(s.name);
    const intra = s.stats.intra ?? 0;
    const outbound = s.stats.outbound ?? 0;
    const classes = s.stats.classes ?? 0;
    const label = useWikilinks
      ? `[[${projectSlug}/${slug}|${s.name}]]`
      : `[${s.name}](#${s.name.replace(/[^a-z0-9]/gi, '').toLowerCase()})`;
    lines.push(`- ${label} — ${s.stats.files} file${s.stats.files === 1 ? '' : 's'}, ${classes} type${classes === 1 ? '' : 's'}, ${intra} intra-edge${intra === 1 ? '' : 's'}, ${outbound} outbound`);
    const info = parsed.moduleInfo.get(s.name);
    if (info) {
      if (info.role) lines.push(`  - **Role:** ${info.role}`);
      if (info.purpose) lines.push(`  - **Purpose:** ${info.purpose}`);
      if (info.entry) lines.push(`  - **Entry:** ${info.entry}`);
      if (info.publicSurface) lines.push(`  - **Public surface:** ${info.publicSurface}`);
      if (info.dependsOn && !/^\(none\)$/i.test(info.dependsOn)) lines.push(`  - **Depends on:** ${info.dependsOn}`);
      if (info.importedBy && !/^\(none\)$/i.test(info.importedBy)) lines.push(`  - **Imported by:** ${info.importedBy}`);
    }
  }
  return lines.join('\n') + '\n';
}

// ── Assembly ─────────────────────────────────────────────────────────────────
function assembleSingle(parsed, cfg) {
  const today = new Date().toISOString().slice(0, 10);
  const notes = [];
  const skipRegexes = cfg.skipPatterns.map(configGlobToRegex);
  const exportsByFile = buildExportsByFile(parsed);

  const structure = renderStructure(parsed, parsed.projectName, skipRegexes);
  const moduleMap = renderModuleMap(parsed, cfg, notes);
  const cross = renderCrossModuleClassRelations(parsed);
  const callGraph = renderCallGraph(parsed, cfg);

  const visibleGroups = parsed.groups
    .filter((g) => !skipRegexes.some((re) => re.test(g.name)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const moduleSections = visibleGroups.map((g) => renderModuleSection(g, parsed, cfg, exportsByFile));

  let out = `# Codemap — ${parsed.projectName}\n`;
  out += `Last rendered: ${today}\n`;
  out += `Source: \`.claude/codemap.md\` (last updated: ${parsed.lastUpdated || 'unknown'})\n\n`;
  const overviewBlock = renderOverviewBlock(parsed);
  if (overviewBlock) out += overviewBlock + '\n';
  out += `## Structure\n\n${structure}\n\n`;
  out += `## Module map\n\n${moduleMap}\n\n`;
  const conventionsBlock = renderConventionsBlock(parsed);
  if (conventionsBlock) out += conventionsBlock + '\n';
  const hubsBlock = renderHubsBlock(parsed);
  if (hubsBlock) out += hubsBlock + '\n';
  // In-repo single file does NOT use wikilinks (no Obsidian vault context),
  // and the per-module bodies follow inline below, so the index list is
  // mostly redundant. Skip it here; the bodies themselves carry the data.
  for (const s of moduleSections) out += s.body + '\n';
  if (cross) out += `## Cross-module class relations\n\n${cross}\n\n`;
  if (callGraph) out += `## Call graph\n\n${callGraph}\n`;
  if (notes.length) out += `## Notes\n\n${notes.join('\n')}\n`;

  return { body: out, moduleSections, notes, structure, moduleMap, cross, callGraph };
}

// Normalise a candidate folder name for fuzzy matching: lowercase, drop punctuation,
// collapse whitespace runs. Lets `Odds, Ends & Errands` match an existing `Odds Ends Errands`.
function normalizeFolderKey(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Derive <ProjectFolder> under <Vault>/Projects/. Convention (shared with pr-review /
// review / document): MATCH an existing Projects/ subfolder first; only create a new one
// when nothing fits. Without this match step the skill spawns near-duplicate folders that
// differ only by stripped punctuation (e.g. `Odds Ends  Errands` vs `Odds, Ends & Errands`).
function inferProjectFolder(projectName, root, vault) {
  const repoName = path.basename(root).toLowerCase();
  if (/isar/.test(repoName) || /^stream-/.test(repoName)) return 'Stream';

  // Collapse internal whitespace runs (a stripped `&`/`,` leaves doubled spaces otherwise).
  const cleaned = projectName.replace(/[^A-Za-z0-9 \-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const fallback = cleaned || path.basename(root);

  // Match an existing Projects/<Name>/ subfolder by normalized key before creating new.
  if (vault) {
    try {
      const projectsDir = path.join(vault, 'Projects');
      const wantKeys = new Set([normalizeFolderKey(projectName), normalizeFolderKey(fallback)]);
      const existing = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      const hit = existing.find((name) => wantKeys.has(normalizeFolderKey(name)));
      if (hit) return hit; // reuse the canonical existing folder verbatim
    } catch {} // Projects/ missing or unreadable → fall through to create `fallback`
  }
  return fallback;
}

function slugify(s) {
  const out = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out || '_root';
}

// Per-module vault layout:
//   <Vault>/Projects/<ProjectFolder>/Codemap/<project>-codemap.md     (index)
//   <Vault>/Projects/<ProjectFolder>/Codemap/<project>/<module>.md    (per-module)
function writeVaultSplit(args, parsed, cfg, single) {
  const today = new Date().toISOString().slice(0, 10);
  const projectFolder = args.projectFolder || inferProjectFolder(parsed.projectName, args.root, args.vault);
  const projectSlug = slugify(parsed.projectName);
  const codemapDir = path.join(args.vault, 'Projects', projectFolder, 'Codemap');
  const projectDir = path.join(codemapDir, projectSlug);
  const indexPath = path.join(codemapDir, `${projectSlug}-codemap.md`);

  // Index: Overview + Structure + Module map + Conventions + Hubs + Modules (wikilinks, enriched) + Cross-module class relations.
  let index = `---\nproject: ${parsed.projectName}\nrepo: ${args.root}\nsource: .claude/codemap.md\nrendered: ${today}\n---\n\n`;
  index += `# Codemap — ${parsed.projectName}\n`;
  index += `Last rendered: ${today}\n`;
  index += `Source codemap last updated: ${parsed.lastUpdated || 'unknown'}\n\n`;
  const overviewBlock = renderOverviewBlock(parsed);
  if (overviewBlock) index += overviewBlock + '\n';
  index += `## Structure\n\n${single.structure}\n\n`;
  index += `## Module map\n\n${single.moduleMap}\n\n`;
  const conventionsBlock = renderConventionsBlock(parsed);
  if (conventionsBlock) index += conventionsBlock + '\n';
  const hubsBlock = renderHubsBlock(parsed);
  if (hubsBlock) index += hubsBlock + '\n';
  index += renderModulesIndexList(parsed, single.moduleSections, projectSlug, /*useWikilinks*/ true);
  index += '\n';
  if (single.cross) index += `## Cross-module class relations\n\n${single.cross}\n\n`;
  if (single.callGraph) index += `## Call graph\n\n${single.callGraph}\n`;
  if (single.notes.length) index += `## Notes\n\n${single.notes.join('\n')}\n`;

  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(indexPath, index);

  for (const s of single.moduleSections) {
    const slug = slugify(s.name);
    const modulePath = path.join(projectDir, `${slug}.md`);
    let body = `---\nproject: ${parsed.projectName}\nmodule: ${s.name}\nsource: .claude/codemap.md\nrendered: ${today}\n---\n\n`;
    body += `# ${s.name} — ${parsed.projectName}\n`;
    body += `[[../${projectSlug}-codemap|← back to codemap index]]\n\n`;
    body += s.body;
    fs.writeFileSync(modulePath, body);
  }

  return { indexPath, projectDir, moduleCount: single.moduleSections.length };
}

function writeVaultSingle(args, parsed, single) {
  const today = new Date().toISOString().slice(0, 10);
  const projectFolder = args.projectFolder || inferProjectFolder(parsed.projectName, args.root, args.vault);
  const projectSlug = slugify(parsed.projectName);
  const vaultPath = path.join(args.vault, 'Projects', projectFolder, 'Codemap', `${projectSlug}-codemap.md`);
  const frontmatter = `---\nproject: ${parsed.projectName}\nrepo: ${args.root}\nsource: .claude/codemap.md\nrendered: ${today}\n---\n\n`;
  fs.mkdirSync(path.dirname(vaultPath), { recursive: true });
  fs.writeFileSync(vaultPath, frontmatter + single.body);
  return { vaultPath };
}

function main() {
  const args = parseArgs(process.argv);
  const root = args.root;
  if (!fs.existsSync(root)) { console.error(`root not found: ${root}`); process.exit(1); }

  const codemap = readCodemap(root);
  if (!codemap) {
    console.error('error: .claude/codemap.md not found. Run `node skills/update-codemap/codemap.mjs` first.');
    process.exit(1);
  }
  log(args, `source: ${codemap.path}`);

  const parsed = parseCodemap(codemap.text);
  const cfg = loadVisualizeConfig(root);
  log(args, `parsed: ${parsed.groups.length} module groups, ${parsed.dependencies.length} dependency lines, ${parsed.fileDeps.length} file-dep lines, ${parsed.classes.length} declared types`);
  if (cfg.skipPatterns.length) log(args, `visualize: ${cfg.skipPatterns.length} skip patterns`);
  log(args, `visualize: renderer=${cfg.renderer}, l1-edge-cap=${cfg.l1EdgeCap}, l2-file-cap=${cfg.l2FileCap}, l2-edge-cap=${cfg.l2EdgeCap}, class-method-cap=${cfg.classMethodCap}, split-per-module=${cfg.splitPerModule}`);

  const dirtyPath = path.join(root, '.claude', 'codemap.dirty');
  if (fs.existsSync(dirtyPath)) log(args, 'WARNING: source codemap is marked dirty (auto-update flag). Run update-codemap first.');

  const single = assembleSingle(parsed, cfg);

  if (args.dryRun) {
    log(args, '--- dry-run output ---');
    process.stdout.write(single.body);
    log(args, '--- end ---');
    return;
  }

  const repoOutPath = path.join(root, '.claude', 'codemap.diagrams.md');
  fs.mkdirSync(path.dirname(repoOutPath), { recursive: true });
  fs.writeFileSync(repoOutPath, single.body);
  log(args, `wrote ${path.relative(root, repoOutPath)}`);

  if (args.vault) {
    try {
      if (cfg.splitPerModule) {
        const r = writeVaultSplit(args, parsed, cfg, single);
        log(args, `wrote ${r.indexPath} (+ ${r.moduleCount} module notes under ${r.projectDir})`);
      } else {
        const r = writeVaultSingle(args, parsed, single);
        log(args, `wrote ${r.vaultPath}`);
      }
    } catch (err) {
      console.error(`vault write failed: ${err.message}`);
      console.error(`If using Claude Code, ensure the Codemap/ subtree is allowlisted in ~/.claude/hook-config.json → outsideProjectWriteBlocker.allow`);
      process.exit(2);
    }
  }
}

main();
