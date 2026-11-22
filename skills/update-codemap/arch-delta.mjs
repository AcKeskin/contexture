#!/usr/bin/env node
// How a change moves the architecture: the codemap at two git refs, compared at folder level.
//
//   node arch-delta.mjs --base <ref> [--head <ref>] [--root <dir>] [--depth N]
//
// Prints the `architecture` object of review's findings.json as JSON. The base is the merge base
// of <base> and <head> (head defaults to HEAD), so commits on the base branch don't count. Each
// codemap is built in a temporary worktree checked out with read-tree, so no git hook fires and
// nothing in it runs; the project's own .claude/ files are not touched. When no code file changed
// (only docs, say), it prints the empty result without building anything.
// A group is a folder `depth` segments deep (default 2: `skills/review/`, `src/api/`); a file
// higher up belongs to its own folder.
// Idea from CodeBoarding's per-PR architecture diff (read 2026-11-22).

import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DIAGRAM_CAP = 16;
// Code languages codemap.mjs parses (its LANG_BY_EXT minus markdown and web): only these move imports or exports.
const CODE_FILE = /\.(h|hpp|hxx|hh|cpp|cc|cxx|c|cs|ts|js|mjs|cjs|tsx|jsx|py|java|kts?|swift|rs|go|rb|php)$/i;

export function groupOf(rel, depth = 2) {
  const parts = rel.split('/');
  if (parts.length === 1) return './';
  return parts.slice(0, Math.min(depth, parts.length - 1)).join('/') + '/';
}

const files = (j) => j.files || {};
const counted = (j, rel) => { const f = files(j)[rel]; return f && !f.vendored; };

// Import counts between groups: Map "a\tb" -> n.
function groupEdges(j, depth) {
  const m = new Map();
  for (const [rel, f] of Object.entries(files(j))) {
    if (f.vendored) continue;
    const a = groupOf(rel, depth);
    for (const t of f.imports || []) {
      if (!counted(j, t)) continue;
      const b = groupOf(t, depth);
      if (a === b) continue;
      const k = `${a}\t${b}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  return m;
}

// Groups on a cycle: strongly connected components with 2+ members (Tarjan), each as sorted names.
function cycles(edges) {
  const adj = new Map();
  for (const k of edges.keys()) {
    const [a, b] = k.split('\t');
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
  }
  let i = 0;
  const idx = new Map(), low = new Map(), stack = [], on = new Set(), out = [];
  const visit = (v) => {
    idx.set(v, i); low.set(v, i); i++; stack.push(v); on.add(v);
    for (const w of adj.get(v)) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const c = [];
      let w;
      do { w = stack.pop(); on.delete(w); c.push(w); } while (w !== v);
      if (c.length > 1) out.push(c.sort());
    }
  };
  for (const v of [...adj.keys()].sort()) if (!idx.has(v)) visit(v);
  return out;
}

function exportsOf(j) {
  const m = new Map();
  for (const [rel, f] of Object.entries(files(j))) {
    for (const s of f.symbols || []) {
      if (!s.exported) continue;
      m.set(`${rel}\t${s.parent ? s.parent + '.' : ''}${s.name}`, { sig: s.signature || '', line: s.line, endLine: s.endLine });
    }
  }
  return m;
}

const split = (k) => k.split('\t');
const sortBy = (xs, key) => xs.sort((a, b) => key(a).localeCompare(key(b)));

export function compare(oldJ, newJ, { depth = 2 } = {}) {
  const of = files(oldJ), nf = files(newJ);
  const added = Object.keys(nf).filter((r) => !of[r]).sort();
  const removed = Object.keys(of).filter((r) => !nf[r]).sort();
  const changed = Object.keys(nf).filter((r) => of[r] && of[r].hash !== nf[r].hash).sort();

  const groupsIn = (fs) => new Set(Object.keys(fs).map((r) => groupOf(r, depth)));
  const og = groupsIn(of), ng = groupsIn(nf);

  const oe = groupEdges(oldJ, depth), ne = groupEdges(newJ, depth);
  const edges = [];
  for (const k of new Set([...oe.keys(), ...ne.keys()])) {
    const before = oe.get(k) || 0, after = ne.get(k) || 0;
    const [from, to] = split(k);
    edges.push({ from, to, before, after });
  }
  sortBy(edges, (e) => e.from + e.to);

  const key = (c) => c.join(' ');
  const ocy = cycles(oe), ncy = cycles(ne);
  const ok = new Set(ocy.map(key)), nk = new Set(ncy.map(key));

  const ox = exportsOf(oldJ), nx = exportsOf(newJ);
  const sym = (k, x) => { const [file, name] = split(k); return { file, name, signature: x.sig || undefined, line: x.line, endLine: x.endLine }; };

  return {
    depth,
    files: { added, removed, changed },
    groups: { added: [...ng].filter((g) => !og.has(g)).sort(), removed: [...og].filter((g) => !ng.has(g)).sort() },
    edges: edges.filter((e) => e.before !== e.after),
    unchangedEdges: edges.filter((e) => e.before === e.after),
    cycles: { added: ncy.filter((c) => !ok.has(key(c))), removed: ocy.filter((c) => !nk.has(key(c))) },
    surface: {
      added: [...nx].filter(([k]) => !ox.has(k)).map(([k, s]) => sym(k, s)),
      removed: [...ox].filter(([k]) => !nx.has(k)).map(([k, s]) => sym(k, s)),
      changed: [...nx].filter(([k, s]) => ox.has(k) && ox.get(k).sig !== s.sig).map(([k, s]) => {
        const o = ox.get(k);
        return { ...sym(k, s), before: o.sig || undefined, beforeLine: o.line, beforeEndLine: o.endLine };
      }),
      // Same (or no) signature in a changed file: addCode checks the declaration text, then drops this list.
      kept: [...nx].filter(([k, s]) => ox.has(k) && ox.get(k).sig === s.sig && of[split(k)[0]].hash !== nf[split(k)[0]].hash).map(([k, s]) => {
        const o = ox.get(k);
        return { ...sym(k, s), beforeLine: o.line, beforeEndLine: o.endLine };
      }),
    },
  };
}

// ── code of added, removed and changed exports ──────────────────────────────

const SNIPPET_LINES = 40; // rows shown per export
const SNIPPETS = 40;      // exports that get code
const SLICE_CAP = 120;    // lines read per side, so the line diff stays small (120 x 120)

function slice(text, line, endLine) {
  if (text == null || !line) return null;
  const ls = text.split(/\r?\n/);
  if (line > ls.length) return null;
  const end = Math.min(ls.length, line + SLICE_CAP - 1, endLine && endLine >= line ? endLine : line + SNIPPET_LINES - 1);
  return ls.slice(line - 1, end);
}

// Line diff (longest common subsequence) of two short snippets: rows of { t, c: 'add' | 'del' | '' }.
export function lineDiff(a, b) {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: b[j], c: '' }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: a[i++], c: 'del' });
    else out.push({ t: b[j++], c: 'add' });
  }
  while (i < n) out.push({ t: a[i++], c: 'del' });
  while (j < m) out.push({ t: b[j++], c: 'add' });
  return out;
}

// The declaration: from the symbol's line to the line that opens its body, at most 6 lines, on one line.
function declaration(lines) {
  if (!lines) return null;
  const out = [];
  for (const l of lines.slice(0, 6)) { out.push(l.trim()); if (/[{:]\s*$|=>|;\s*$/.test(l)) break; }
  return out.join(' ').replace(/\s*\{\s*$/, '').replace(/\s+/g, ' ');
}

const capRows = (rows) => (rows.length > SNIPPET_LINES * 1.5 ? [...rows.slice(0, SNIPPET_LINES), { t: `… ${rows.length - SNIPPET_LINES} more lines`, c: 'gap' }] : rows);

// Adds `code` rows to surface entries: a changed export as a line diff of its old and new code, an
// added or removed one as its declaration line. Also counts an export as changed when its declaration
// line changed, since most extractors leave `signature` empty.
// read(side, files) gives Map(file -> text) at 'base' or 'head'; a missing file is left out.
export function addCode(d, read) {
  const need = (xs) => [...new Set(xs.map((s) => s.file))];
  const base = read('base', need([...(d.surface.kept || []), ...d.surface.changed, ...d.surface.removed]));
  const head = read('head', need([...(d.surface.kept || []), ...d.surface.changed, ...d.surface.added]));
  const before = (s) => slice(base.get(s.file), s.beforeLine, s.beforeEndLine);
  const after = (s) => slice(head.get(s.file), s.line, s.endLine);
  for (const s of d.surface.kept || []) {
    const da = declaration(before(s)), db = declaration(after(s));
    if (da && db && da !== db) d.surface.changed.push({ ...s, before: da.slice(0, 160), signature: db.slice(0, 160) });
  }
  delete d.surface.kept;
  let left = SNIPPETS;
  const put = (s, rows) => { if (rows && rows.length && left > 0) { s.code = capRows(rows); left--; } };
  for (const s of d.surface.changed) { const a = before(s), b = after(s); if (a && b) put(s, lineDiff(a, b)); }
  for (const s of d.surface.added) { const b = after(s); if (b) put(s, [{ t: b[0], c: 'add' }]); }
  for (const s of d.surface.removed) { const a = slice(base.get(s.file), s.line, s.endLine); if (a) put(s, [{ t: a[0], c: 'del' }]); }
  return d;
}

// Text of files at a commit, all in one `git cat-file --batch`: Map(file -> text).
export function readAt(root, ref, files) {
  const out = new Map();
  if (!files.length) return out;
  const r = spawnSync('git', ['cat-file', '--batch'], { cwd: root, input: files.map((f) => `${ref}:${f}`).join('\n') + '\n', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git cat-file failed: ${String(r.stderr).trim()}`);
  const buf = r.stdout;
  let at = 0;
  for (const f of files) {
    const nl = buf.indexOf(10, at);
    const head = buf.toString('utf8', at, nl);
    at = nl + 1;
    const m = head.match(/ blob (\d+)$/);
    if (!m) continue; // "<name> missing"
    out.set(f, buf.toString('utf8', at, at + Number(m[1])));
    at += Number(m[1]) + 1;
  }
  return out;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function summary(d) {
  const add = d.edges.filter((e) => !e.before).length;
  const gone = d.edges.filter((e) => !e.after).length;
  const parts = [];
  if (add || gone) parts.push(`${plural(add, 'new folder link')}, ${gone} removed`);
  else parts.push('no new or removed folder links');
  if (d.groups.added.length) parts.push(`${plural(d.groups.added.length, 'new folder')}`);
  if (d.groups.removed.length) parts.push(`${plural(d.groups.removed.length, 'folder')} gone`);
  if (d.cycles.added.length) parts.push(`${plural(d.cycles.added.length, 'new cycle')}`);
  if (d.cycles.removed.length) parts.push(`${plural(d.cycles.removed.length, 'cycle')} broken`);
  const s = d.surface;
  if (s.added.length || s.removed.length || s.changed.length) parts.push(`exports +${s.added.length} / ~${s.changed.length} / -${s.removed.length}`);
  return parts.join(', ') + '.';
}

const mid = (g) => 'g_' + g.replace(/[^A-Za-z0-9]/g, '_');
const mlabel = (s) => s.replace(/"/g, "'");

// One flowchart: touched folders and their direct neighbours. New links green, removed red dashed.
export function mermaid(d, { cap = DIAGRAM_CAP } = {}) {
  const touched = new Set();
  for (const r of [...d.files.added, ...d.files.removed, ...d.files.changed]) touched.add(groupOf(r, d.depth));
  for (const e of d.edges) { touched.add(e.from); touched.add(e.to); }
  if (!touched.size) return null;
  const all = [...d.edges, ...d.unchangedEdges];
  const weight = new Map();
  for (const e of d.unchangedEdges) {
    for (const [g, other] of [[e.from, e.to], [e.to, e.from]]) {
      if (touched.has(other) && !touched.has(g)) weight.set(g, (weight.get(g) || 0) + e.after);
    }
  }
  const prio = (g) => (d.edges.some((e) => e.from === g || e.to === g) ? 0 : 1);
  let shown = [...touched].sort((a, b) => prio(a) - prio(b) || a.localeCompare(b)).slice(0, cap);
  for (const [g] of [...weight].sort((a, b) => b[1] - a[1])) { if (shown.length >= cap) break; shown.push(g); }
  // A folder whose files changed but whose links did not only adds a loose box; leave it out.
  const linked = new Set();
  for (const e of all) if (shown.includes(e.from) && shown.includes(e.to)) { linked.add(e.from); linked.add(e.to); }
  const keep = (g) => linked.has(g) || d.groups.added.includes(g) || d.groups.removed.includes(g);
  if (!shown.some(keep)) return null;
  const set = new Set(shown.filter(keep));
  shown = shown.filter(keep);
  const addedG = new Set(d.groups.added), removedG = new Set(d.groups.removed);
  const lines = ['flowchart TB'];
  for (const g of shown) {
    const cls = addedG.has(g) ? ':::added' : removedG.has(g) ? ':::removed' : touched.has(g) ? ':::touched' : '';
    lines.push(`  ${mid(g)}["${mlabel(g)}"]${cls}`);
  }
  const styles = [];
  let n = 0;
  for (const e of all) {
    if (!set.has(e.from) || !set.has(e.to)) continue;
    if (!e.before) { lines.push(`  ${mid(e.from)} -->|"new ${e.after}"| ${mid(e.to)}`); styles.push(`  linkStyle ${n} stroke:#1E7A46,stroke-width:3px`); }
    else if (!e.after) { lines.push(`  ${mid(e.from)} -.->|"gone ${e.before}"| ${mid(e.to)}`); styles.push(`  linkStyle ${n} stroke:#B42318,stroke-width:2px`); }
    else if (e.before !== e.after) { lines.push(`  ${mid(e.from)} -->|"${e.before} to ${e.after}"| ${mid(e.to)}`); styles.push(`  linkStyle ${n} stroke:#A15C07,stroke-width:2px`); }
    else lines.push(`  ${mid(e.from)} --> ${mid(e.to)}`);
    n++;
  }
  lines.push(...styles);
  lines.push('  classDef added stroke:#1E7A46,stroke-width:3px', '  classDef removed stroke:#B42318,stroke-width:2px,stroke-dasharray:5 4', '  classDef touched stroke:#A15C07,stroke-width:2px');
  return lines.join('\n');
}

// The `architecture` object in review's findings.json.
export function forReview(d, { base, head } = {}) {
  return {
    base, head, depth: d.depth,
    summary: summary(d),
    mermaid: mermaid(d),
    edges: d.edges,
    groups: d.groups,
    cycles: d.cycles,
    surface: { added: d.surface.added, removed: d.surface.removed, changed: d.surface.changed },
    files: { added: d.files.added.length, removed: d.files.removed.length, changed: d.files.changed.length },
  };
}

// ── building codemaps for git refs ──────────────────────────────────────────

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
}

function runCodemap(dir) {
  const r = spawnSync(process.execPath, [join(here, 'codemap.mjs'), '--root', dir], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`codemap.mjs failed for ${dir}: ${(r.stderr || r.stdout || '').trim()}`);
  return JSON.parse(readFileSync(join(dir, '.claude', 'codemap.json'), 'utf8'));
}

// Worktrees still on disk; removed on exit, Ctrl-C or kill.
const open = new Set();
function drop(root, dir) {
  spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: root });
  rmSync(dir, { recursive: true, force: true });
  spawnSync('git', ['worktree', 'prune'], { cwd: root });
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const [root, dir] of [...open]) drop(root, dir); process.exit(130); });

// codemap.json for a commit, built in a temporary worktree that is removed afterwards.
// --no-checkout + read-tree: `worktree add` with a checkout runs the repo's post-checkout hook.
export function codemapAt(root, sha) {
  const dir = mkdtempSync(join(tmpdir(), 'arch-delta-'));
  git(root, ['worktree', 'add', '--no-checkout', '--detach', '--quiet', dir, sha]);
  const entry = [root, dir];
  open.add(entry);
  try {
    const r = spawnSync('git', ['read-tree', '-u', '--reset', 'HEAD'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' } });
    if (r.status !== 0) throw new Error(`git read-tree failed: ${(r.stderr || '').trim()}`);
    // The project's codemap config is often gitignored; the worktree needs it for the same skip rules.
    const cfg = join(root, '.claude', 'codemap.config.md');
    if (existsSync(cfg)) { mkdirSync(join(dir, '.claude'), { recursive: true }); copyFileSync(cfg, join(dir, '.claude', 'codemap.config.md')); }
    return runCodemap(dir);
  } finally {
    open.delete(entry);
    drop(root, dir);
  }
}

const EMPTY = { files: {} };

function parseArgs(argv) {
  const a = { depth: 2, root: process.env.CLAUDE_PROJECT_DIR || process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--base') a.base = argv[++i];
    else if (x === '--head') a.head = argv[++i];
    else if (x === '--root') a.root = argv[++i];
    else if (x === '--depth') a.depth = Math.max(1, parseInt(argv[++i], 10) || 2);
    else if (x === '-h' || x === '--help') a.help = true;
  }
  a.root = resolve(a.root);
  return a;
}

function main(argv) {
  const a = parseArgs(argv);
  if (a.help || !a.base) {
    console.error('usage: node arch-delta.mjs --base <ref> [--head <ref>] [--root <dir>] [--depth N]');
    process.exit(a.help ? 0 : 2);
  }
  const head = git(a.root, ['rev-parse', '--verify', `${a.head || 'HEAD'}^{commit}`]);
  const base = git(a.root, ['merge-base', `${a.base}^{commit}`, head]);
  const code = git(a.root, ['diff', '--name-only', '--no-renames', base, head]).split('\n').some((f) => CODE_FILE.test(f));
  const d = code ? compare(codemapAt(a.root, base), codemapAt(a.root, head), { depth: a.depth }) : compare(EMPTY, EMPTY);
  if (code) {
    addCode(d, (side, files) => readAt(a.root, side === 'base' ? base : head, files));
  }
  const out = forReview(d, { base: a.base, head: a.head || 'HEAD' });
  if (!code) out.summary = 'no code files changed.';
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

const isMain = process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`arch-delta: ${e.message}`); process.exit(1); }
}
