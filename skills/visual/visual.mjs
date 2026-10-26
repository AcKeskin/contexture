#!/usr/bin/env node
// Deterministic half of the visual organ: the contract, drift between token
// copies, captures by named state, freshness, the baseline with history and
// rollback, pixel diff per region, style-dump checks, the critic's input, and
// verdict validation. The critic itself is a fresh agent; this script only
// prepares its files and checks what it returns.
//
// Usage: node visual.mjs <command> <repo> [args]
//   contract <repo>                                   validate .claude/visual/contract.json
//   drift <repo>                                      one card per token that differs between the canonical file and a copy
//   capture <repo> --out <dir> [--tree <path>] [--states a,b]   run each state's command, keep its image + a manifest
//   fresh <manifest> --tree <path>                    exit 1 when a capture is older than the tree's HEAD
//   diff <repo> <state> <capture.png> [--region x,y,w,h] --out <diff.png>
//   styles <repo> <dump.json>                         off-contract values, contrast, overflow
//   touched <repo> <run> --tree <path>                diff every state's before vs after; write <run>/visual/touched.json; exit 1 when captures are missing
//   critic-input <repo> <run> --touched a,b           the files a fresh critic sees, as JSON
//   record <repo> <run> <verdicts.json> [--tree <path>]   validate, log, move baselines
//   approve <repo> <state> <capture.png>              make a capture the baseline, keeping the old one
//   rollback <repo> <state> [history-file]            restore an earlier baseline
//   rate <repo> <decision-id> <agree|disagree>        the user's review of a critic decision
//   agreement <repo>                                  rated, agreed, rate
//   status <repo>                                     what the cycle status page shows, as JSON

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, copyFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname, resolve, relative, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import pngjs from 'pngjs';
import pixelmatch from 'pixelmatch';

const { PNG } = pngjs;
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULTS = JSON.parse(readFileSync(join(HERE, 'contract-defaults.json'), 'utf8'));
const CAPTURE_TIMEOUT_MS = 10 * 60 * 1000;
export const VERDICTS = ['consistent', 'needs-revision', 'taste'];

// --- paths --------------------------------------------------------------------

const visualDir = (repo) => join(repo, '.claude', 'visual');
const contractFile = (repo) => join(visualDir(repo), 'contract.json');
const baselineFile = (repo, state) => join(visualDir(repo), 'baseline', `${state}.png`);
const historyDir = (repo, state) => join(visualDir(repo), 'history', state);
const decisionsFile = (repo) => join(visualDir(repo), 'decisions.jsonl');
const cardsDir = (repo) => join(visualDir(repo), 'cards');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// --- the contract ----------------------------------------------------------------

/** The contract with defaults filled in. Throws with every problem found. */
export function readContract(repo) {
  if (!existsSync(contractFile(repo))) throw new Error(`no contract at ${contractFile(repo)}`);
  const c = JSON.parse(readFileSync(contractFile(repo), 'utf8'));
  const problems = [];
  if (!c.tokens?.source) problems.push('tokens.source is missing');
  else if (!existsSync(resolve(repo, c.tokens.source))) problems.push(`tokens.source not found: ${c.tokens.source}`);
  if (!Array.isArray(c.states) || !c.states.length) problems.push('states is empty');
  for (const s of c.states || []) {
    for (const k of ['id', 'command', 'output']) if (!s[k]) problems.push(`state ${s.id || '?'} has no ${k}`);
    if (s.id && !/^[a-z0-9][a-z0-9-]*$/.test(s.id)) problems.push(`state id "${s.id}" must be lowercase letters, digits and dashes`);
  }
  for (const r of c.references || []) {
    if (!existsSync(resolve(repo, r.file))) problems.push(`reference not found: ${r.file}`);
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return {
    ...c,
    tokens: { copies: [], ...c.tokens },
    references: c.references || [],
    tells_off: c.tells_off || [],
    critic: { ...DEFAULTS.critic, ...(c.critic || {}) },
  };
}

/** The default tells minus the ones this project switched off. */
export function activeTells(contract) {
  return DEFAULTS.tells.filter((t) => !contract.tells_off.includes(t.id));
}

// --- tokens and drift -------------------------------------------------------------

const normName = (n) => n.replace(/^--/, '').replace(/[./_\s]+/g, '-').toLowerCase();

/** Normalizes a color or size so equal values compare equal: #ABC -> #aabbcc, rgb() -> hex. */
export function normValue(v) {
  const s = String(v).trim().toLowerCase();
  const short = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const rgb = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/);
  if (rgb) {
    const hex = [rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    return rgb[4] !== undefined && Number(rgb[4]) < 1 ? `#${hex}@${Number(rgb[4])}` : `#${hex}`;
  }
  return s;
}

/** Flat token map from a JSON or CSS file: { name: value }. JSON handles nested maps and {name, value} lists. */
export function readTokens(file) {
  const text = readFileSync(file, 'utf8');
  if (extname(file).toLowerCase() === '.css') {
    const out = {};
    for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[normName(m[1])] = normValue(m[2]);
    // A plugin styled through its host's theme variables only carries values as fallbacks: var(--x, #6965db).
    for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*,\s*((?:[^()]|\([^()]*\))+?)\s*\)/g)) {
      const name = normName(m[1]);
      if (!(name in out)) out[name] = normValue(m[2]);
    }
    return out;
  }
  const out = {};
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === 'object' && 'name' in item && 'value' in item) walk(item.value, [...path, item.name]);
        else walk(item, path);
      }
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) if (!['usage', 'description', 'note'].includes(k)) walk(v, [...path, k]);
    } else if (typeof node === 'string' || typeof node === 'number') {
      if (path.length) out[normName(path.join('-'))] = normValue(node);
    }
  };
  walk(JSON.parse(text), []);
  return out;
}

/** Tokens present in both files whose values differ: [{ token, canonical, copy }]. */
export function tokenDrift(canonical, copy) {
  const diffs = [];
  for (const [name, value] of Object.entries(copy)) {
    const match = Object.keys(canonical).find((k) => k === name || k.endsWith(`-${name}`) || name.endsWith(`-${k}`));
    if (match && canonical[match] !== value) diffs.push({ token: match, canonical: canonical[match], copy: value });
  }
  return diffs;
}

function writeCard(repo, name, kind, title, body) {
  mkdirSync(cardsDir(repo), { recursive: true });
  writeFileSync(join(cardsDir(repo), name), `---\nkind: ${kind}\nstatus: open\nstage: visual\n---\n# ${title}\n\n${body}\n`);
}

function drift(repo) {
  const c = readContract(repo);
  const canon = readTokens(resolve(repo, c.tokens.source));
  let count = 0;
  for (const copy of c.tokens.copies) {
    const path = resolve(repo, copy);
    if (!existsSync(path) || !['.json', '.css'].includes(extname(path).toLowerCase())) {
      console.log(`skip ${copy}: not a local JSON or CSS file`);
      continue;
    }
    for (const d of tokenDrift(canon, readTokens(path))) {
      count += 1;
      const slug = `drift-${d.token}-${basename(copy).replace(/\W+/g, '-')}`.slice(0, 80);
      writeCard(repo, `${slug}.md`, 'card', `Token drift: ${d.token}`,
        `\`${c.tokens.source}\` (canonical) has \`${d.canonical}\`; \`${copy}\` has \`${d.copy}\`. The canonical file wins; update the copy, or change the canonical value if the copy is right.`);
      console.log(`drift: ${d.token} ${c.tokens.source}=${d.canonical} ${copy}=${d.copy}`);
    }
  }
  console.log(`${count} drift card(s)`);
}

// --- captures ----------------------------------------------------------------------

function envFor(state) {
  const env = { ...process.env };
  for (const k of Object.keys(state.env || {})) {
    for (const e of Object.keys(env)) if (process.platform === 'win32' && e.toUpperCase() === k.toUpperCase()) delete env[e];
  }
  return { ...env, ...(state.env || {}) };
}

const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' });
const headOf = (tree) => git(tree, 'rev-parse', 'HEAD').stdout.trim();

/** Tracked files with unstaged changes in the tree. */
const modifiedTracked = (tree) => new Set(git(tree, 'diff', '--name-only').stdout.split(/\r?\n/).filter(Boolean));

/** States that share a command and env run once: [{ command, env, port, states }]. */
export function captureGroups(states) {
  const groups = new Map();
  for (const s of states) {
    const key = JSON.stringify([s.command, s.env || {}]);
    if (!groups.has(key)) groups.set(key, { command: s.command, env: s.env, port: s.port, states: [] });
    groups.get(key).states.push(s);
  }
  return [...groups.values()];
}

/** True when something already listens on the port: a dev server there could be serving another tree. */
export function portBusy(port) {
  const probe = `require('net').connect(${Number(port)},'127.0.0.1').on('connect',()=>process.exit(1)).on('error',()=>process.exit(0))`;
  return spawnSync(process.execPath, ['-e', probe], { timeout: 5000 }).status === 1;
}

/** Runs each state's capture command once per group in the tree, keeps the images, and restores every tracked file it changed. */
function capture(repo, outDir, tree, only) {
  const c = readContract(repo);
  mkdirSync(outDir, { recursive: true });
  const commit = headOf(tree);
  const manifest = [];
  const dirtyBefore = modifiedTracked(tree);
  for (const g of captureGroups(c.states.filter((x) => !only.length || only.includes(x.id)))) {
    const port = g.port ?? c.capture_port;
    if (port && portBusy(port)) {
      for (const s of g.states) manifest.push({ state: s.id, error: `port ${port} is already in use: stop that server, or the capture may show another tree` });
      continue;
    }
    const r = spawnSync(g.command, { cwd: tree, env: envFor(g), shell: true, encoding: 'utf8', timeout: CAPTURE_TIMEOUT_MS });
    for (const s of g.states) {
      const produced = resolve(tree, s.output);
      if (r.status !== 0 || !existsSync(produced)) {
        manifest.push({ state: s.id, error: `capture failed (exit ${r.status}): ${(r.stderr || r.stdout || '').trim().split('\n').pop()}` });
        continue;
      }
      const file = join(outDir, `${s.id}.png`);
      copyFileSync(produced, file);
      manifest.push({ state: s.id, file: relative(repo, file).replace(/\\/g, '/'), commit, at: new Date().toISOString() });
    }
    // Restore what this capture rewrote (screenshots, snapshots), never changes that were there before it.
    for (const f of modifiedTracked(tree)) if (!dirtyBefore.has(f)) git(tree, 'checkout', '--', f);
  }
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const m of manifest) console.log(m.error ? `failed ${m.state}: ${m.error}` : `captured ${m.state}`);
  if (manifest.some((m) => m.error)) process.exit(1);
}

/** Manifest entries whose capture is not from the tree's current HEAD. */
export function staleCaptures(manifest, head) {
  return manifest.filter((m) => !m.error && m.commit !== head);
}

// --- baseline ------------------------------------------------------------------------

/** Makes a capture the baseline; the previous baseline moves to history. */
export function approve(repo, state, capturePath) {
  const base = baselineFile(repo, state);
  mkdirSync(dirname(base), { recursive: true });
  if (existsSync(base)) {
    mkdirSync(historyDir(repo, state), { recursive: true });
    copyFileSync(base, join(historyDir(repo, state), `${stamp()}.png`));
  }
  copyFileSync(capturePath, base);
  return base;
}

/** Restores the newest history entry (or the one named); the current baseline moves to history, so rollback can be undone. */
export function rollback(repo, state, historyName) {
  const dir = historyDir(repo, state);
  const entries = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).sort() : [];
  const pick = historyName ? entries.find((e) => e === basename(historyName)) : entries.at(-1);
  if (!pick) throw new Error(`no baseline history for ${state}`);
  const base = baselineFile(repo, state);
  const restored = readFileSync(join(dir, pick));
  if (existsSync(base)) copyFileSync(base, join(dir, `${stamp()}-before-rollback.png`));
  writeFileSync(base, restored);
  return pick;
}

// --- pixel diff ------------------------------------------------------------------------

const STRICT = 0.001;
const LOOSE = 0.02;

// Two captures of the same code differ a little (font hinting, thumbnail timing). Below the
// noise floor a change is not reported; a state or the contract can raise it.
export const DEFAULT_NOISE = 0.01;

/** Compares a capture with its baseline: { finding, inside, outside } as ratios of changed pixels. No region = the whole frame. */
export function regionDiff(baselinePath, capturePath, region, outPath, noise = DEFAULT_NOISE) {
  const a = PNG.sync.read(readFileSync(baselinePath));
  const b = PNG.sync.read(readFileSync(capturePath));
  if (a.width !== b.width || a.height !== b.height) {
    return { finding: `size changed from ${a.width}x${a.height} to ${b.width}x${b.height}`, inside: 1, outside: 1 };
  }
  const out = new PNG({ width: a.width, height: a.height });
  pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0.1, diffColor: [255, 0, 0], alpha: 0.2 });
  if (outPath) writeFileSync(outPath, PNG.sync.write(out));
  const r = region || { x: 0, y: 0, w: a.width, h: a.height };
  let inChanged = 0; let inTotal = 0; let outChanged = 0; let outTotal = 0;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const i = (y * a.width + x) * 4;
      const changed = out.data[i] === 255 && out.data[i + 1] === 0 && out.data[i + 2] === 0;
      const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
      if (inside) { inTotal += 1; if (changed) inChanged += 1; } else { outTotal += 1; if (changed) outChanged += 1; }
    }
  }
  const inside = inTotal ? inChanged / inTotal : 0;
  const outside = outTotal ? outChanged / outTotal : 0;
  const p = (v) => `${(v * 100).toFixed(2)}%`;
  if (!region) {
    return { finding: inside > Math.max(STRICT, noise) ? `changed across the frame (${p(inside)})` : `no change above the noise floor (${p(noise)})`, inside, outside };
  }
  const notes = [];
  if (inside > Math.max(STRICT, noise)) notes.push(`changed inside the touched region (${p(inside)})`);
  if (outside > Math.max(LOOSE, noise)) notes.push(`changed outside the touched region (${p(outside)})`);
  return { finding: notes.join('; ') || `no change above the noise floor (${p(noise)})`, inside, outside };
}

/**
 * Which states a run's change touched, from pixels: each state's before vs after
 * capture, above that state's noise floor. The loop's critic trigger, so no model
 * decides whether a change is visible. Returns { states, diffs, missing }.
 */
export function touchedStates(repo, run) {
  const c = readContract(repo);
  const vdir = join(repo, '.claude', 'cycle', run, 'visual');
  const diffs = {};
  const missing = [];
  for (const s of c.states) {
    const before = join(vdir, 'before', `${s.id}.png`);
    const after = join(vdir, 'after', `${s.id}.png`);
    if (!existsSync(before) || !existsSync(after)) {
      missing.push(s.id);
      continue;
    }
    const noise = Number(s.noise ?? c.diff?.noise ?? DEFAULT_NOISE);
    const r = regionDiff(before, after, null, join(vdir, `diff-${s.id}.png`), noise);
    diffs[s.id] = { changed: r.inside, noise, touched: r.inside > Math.max(STRICT, noise) };
  }
  return { states: Object.keys(diffs).filter((id) => diffs[id].touched), diffs, missing };
}

const parseRegion = (s) => {
  if (!s) return null;
  const [x, y, w, h] = s.split(',').map(Number);
  return { x, y, w, h };
};

// --- style-dump checks -------------------------------------------------------------------

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two #rrggbb colors. */
export function contrast(fg, bg) {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const isHex = (v) => /^#[0-9a-f]{6}$/.test(v);

/** Findings from a computed-style dump: [{ state, selector, check, value, line }]. */
export function styleFindings(dump, tokens, source) {
  const colors = new Set(Object.values(tokens).filter(isHex));
  const sizes = new Set(Object.values(tokens).filter((v) => /^\d+(\.\d+)?px$/.test(v)));
  const line = `tokens: ${source}`;
  const out = [];
  for (const el of dump) {
    const color = el.color ? normValue(el.color) : '';
    const bg = el.background ? normValue(el.background) : '';
    for (const [prop, v] of [['color', color], ['background', bg]]) {
      if (isHex(v) && colors.size && !colors.has(v)) out.push({ state: el.state, selector: el.selector, check: `off-contract ${prop}`, value: v, line });
    }
    const fs = el.fontSize ? String(el.fontSize).trim() : '';
    if (fs && sizes.size && !sizes.has(fs)) out.push({ state: el.state, selector: el.selector, check: 'off-contract font size', value: fs, line });
    if (isHex(color) && isHex(bg)) {
      const ratio = contrast(color, bg);
      const large = parseFloat(fs) >= 24;
      if (ratio < (large ? 3 : 4.5)) out.push({ state: el.state, selector: el.selector, check: 'contrast below WCAG AA', value: ratio.toFixed(2), line: 'WCAG 2 AA' });
    }
    if (Number(el.scrollWidth) > Number(el.clientWidth) + 1) out.push({ state: el.state, selector: el.selector, check: 'horizontal overflow', value: `${el.scrollWidth} > ${el.clientWidth}`, line: 'layout: no horizontal overflow' });
  }
  return out;
}

// --- the critic's input and verdicts ---------------------------------------------------------

/** The states the critic judges: the touched ones plus siblings per `critic.scope`. */
export function criticStates(contract, touched) {
  const ids = contract.states.map((s) => s.id);
  if (contract.critic.scope === 'all') return ids;
  const sibling = ids.find((id) => !touched.includes(id));
  return [...touched.filter((t) => ids.includes(t)), ...(sibling ? [sibling] : [])];
}

/** The files a fresh critic sees, in priority order, capped at critic.image_cap images. */
export function criticInput(repo, run, touched) {
  const c = readContract(repo);
  const runVisual = join(repo, '.claude', 'cycle', run, 'visual');
  const states = criticStates(c, touched).map((id) => {
    const after = join(runVisual, 'after', `${id}.png`);
    const before = join(runVisual, 'before', `${id}.png`);
    const base = baselineFile(repo, id);
    const findings = existsSync(join(runVisual, 'findings.json'))
      ? JSON.parse(readFileSync(join(runVisual, 'findings.json'), 'utf8')).filter((f) => f.state === id) : [];
    return { id, touched: touched.includes(id), after: existsSync(after) ? after : null, before: existsSync(before) ? before : null, baseline: existsSync(base) ? base : null, findings };
  });
  const images = [];
  for (const s of states) for (const k of ['after', 'baseline', 'before']) if (s[k]) images.push({ state: s.id, kind: k, file: s[k] });
  for (const r of c.references) images.push({ state: null, kind: 'reference', file: resolve(repo, r.file), take: r.take });
  const cap = Number(c.critic.image_cap);
  const kept = images.slice(0, cap);
  const rel = (p) => relative(repo, p).replace(/\\/g, '/');
  return {
    contract: {
      tokens: c.tokens.source,
      // The values themselves, so the critic does not have to parse the token file.
      token_values: readTokens(resolve(repo, c.tokens.source)),
      states: c.states.map(({ id, shows }) => ({ id, shows })),
      notes: c.notes || '',
    },
    tells: activeTells(c),
    states: states.map((s) => ({ ...s, after: s.after && rel(s.after), before: s.before && rel(s.before), baseline: s.baseline && rel(s.baseline) })),
    images: kept.map((i) => ({ ...i, file: rel(i.file) })),
    omitted: images.length - kept.length,
  };
}

/** Problems with a verdict list for the given states: [] when valid. */
export function verdictProblems(verdicts, expected) {
  const problems = [];
  if (!Array.isArray(verdicts)) return ['verdicts must be a JSON array'];
  for (const id of expected) if (!verdicts.some((v) => v.state === id)) problems.push(`no verdict for state ${id}`);
  for (const v of verdicts) {
    const at = `verdict for ${v.state || '?'}`;
    if (!VERDICTS.includes(v.verdict)) problems.push(`${at}: verdict must be one of ${VERDICTS.join(', ')}`);
    if (!v.evidence) problems.push(`${at}: evidence is required`);
    if (v.checked_against_code !== true) problems.push(`${at}: checked_against_code must be true (check the claim against the code first)`);
    if (v.verdict === 'needs-revision' && (!v.contract_line || !v.region)) problems.push(`${at}: needs-revision needs contract_line and region`);
    if (v.verdict === 'taste' && (!v.taste?.chose || !Array.isArray(v.taste?.alternatives) || !v.taste?.why)) problems.push(`${at}: taste needs taste.chose, taste.alternatives and taste.why`);
    if (v.verdict === 'consistent' && !v.contract_line) problems.push(`${at}: consistent needs the contract_line it was checked against`);
  }
  return problems;
}

const decisionId = (run, state, at) => createHash('sha1').update(`${run}|${state}|${at}`).digest('hex').slice(0, 10);

function readDecisions(repo) {
  if (!existsSync(decisionsFile(repo))) return [];
  return readFileSync(decisionsFile(repo), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function writeDecisions(repo, list) {
  writeFileSync(decisionsFile(repo), list.map((d) => JSON.stringify(d)).join('\n') + (list.length ? '\n' : ''));
}

/** Validates verdicts against fresh captures, logs them, and moves baselines for approvals. Returns { problems, recorded }. */
export function record(repo, run, verdicts, tree) {
  const c = readContract(repo);
  const runVisual = join(repo, '.claude', 'cycle', run, 'visual');
  const manifestPath = join(runVisual, 'after', 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
  // Every state is captured; the touched ones are those `touched` found changed. Older runs have no touched.json.
  const touchedFile = join(runVisual, 'touched.json');
  const touched = existsSync(touchedFile)
    ? JSON.parse(readFileSync(touchedFile, 'utf8')).states
    : manifest.filter((m) => !m.error).map((m) => m.state);
  const expected = criticStates(c, touched);
  const problems = verdictProblems(verdicts, expected);
  if (tree) {
    for (const m of staleCaptures(manifest, headOf(tree))) problems.push(`capture of ${m.state} is from ${m.commit.slice(0, 7)}, not the branch head: retake it`);
  }
  if (problems.length) return { problems, recorded: [] };
  mkdirSync(visualDir(repo), { recursive: true });
  const recorded = [];
  for (const v of verdicts) {
    const at = new Date().toISOString();
    const after = join(runVisual, 'after', `${v.state}.png`);
    const entry = { id: decisionId(run, v.state, at), run, at, ...v, before: rel(repo, join(runVisual, 'before', `${v.state}.png`)), after: rel(repo, after), user: null };
    if (v.verdict !== 'needs-revision' && existsSync(after) && touched.includes(v.state)) entry.baseline_moved = rel(repo, approve(repo, v.state, after));
    appendFileSync(decisionsFile(repo), `${JSON.stringify(entry)}\n`);
    recorded.push(entry);
  }
  return { problems: [], recorded };
}

const rel = (repo, p) => relative(repo, p).replace(/\\/g, '/');

/** The user's review of one decision. A disagreement on a taste call proposes a contract change. */
export function rate(repo, id, rating) {
  if (!['agree', 'disagree'].includes(rating)) throw new Error('rating must be agree or disagree');
  const list = readDecisions(repo);
  const d = list.find((x) => x.id === id);
  if (!d) throw new Error(`no decision ${id}`);
  d.user = rating;
  d.rated_at = new Date().toISOString();
  writeDecisions(repo, list);
  if (rating === 'disagree' && d.verdict === 'taste') {
    writeCard(repo, `contract-${id}.md`, 'card', `Contract change: ${d.state}`,
      `You disagreed with the critic's taste call on \`${d.state}\` (it chose "${d.taste.chose}" over ${d.taste.alternatives.map((a) => `"${a}"`).join(', ')}). Add a contract line that settles this choice, so the next critic does not guess it again.`);
  }
  return d;
}

/** { rated, agreed, rate } over every decision the user reviewed. */
export function agreement(repo) {
  const rated = readDecisions(repo).filter((d) => d.user);
  const agreed = rated.filter((d) => d.user === 'agree').length;
  return { rated: rated.length, agreed, rate: rated.length ? agreed / rated.length : null };
}

/** What the cycle status page shows: decisions newest first, agreement, references, baseline history. */
export function visualStatus(repo) {
  if (!existsSync(contractFile(repo))) return { enabled: false };
  let contract;
  try {
    contract = readContract(repo);
  } catch (err) {
    return { enabled: true, error: err.message };
  }
  const history = Object.fromEntries(contract.states.map((s) => {
    const dir = historyDir(repo, s.id);
    return [s.id, existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).length : 0];
  }));
  return {
    enabled: true,
    decisions: readDecisions(repo).reverse(),
    agreement: agreement(repo),
    references: contract.references,
    states: contract.states.map(({ id, shows }) => ({ id, shows, baseline: existsSync(baselineFile(repo, id)) ? rel(repo, baselineFile(repo, id)) : null })),
    history,
  };
}

// --- entry ------------------------------------------------------------------------------------

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function positional(args) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) i += 1;
    else out.push(args[i]);
  }
  return out;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const pos = positional(rest);
  const repo = pos[0] ? resolve(pos[0]) : process.cwd();
  try {
    switch (cmd) {
      case 'contract': {
        const c = readContract(repo);
        console.log(`contract ok: ${c.states.length} state(s), ${c.references.length} reference(s), tokens ${c.tokens.source}`);
        if (c.references.length < 3) console.log('note: 3 to 5 references give the critic something to compare against');
        return;
      }
      case 'drift': return drift(repo);
      case 'capture': {
        const out = resolve(flag(rest, '--out') || join(visualDir(repo), 'audit', stamp()));
        return capture(repo, out, resolve(flag(rest, '--tree') || repo), (flag(rest, '--states') || '').split(',').filter(Boolean));
      }
      case 'fresh': {
        const manifest = JSON.parse(readFileSync(pos[0], 'utf8'));
        const stale = staleCaptures(manifest, headOf(resolve(flag(rest, '--tree') || process.cwd())));
        for (const m of stale) console.log(`stale: ${m.state} from ${m.commit.slice(0, 7)}`);
        if (stale.length) process.exit(1);
        return console.log('all captures are from the current head');
      }
      case 'diff': {
        const [, state, capturePath] = pos;
        const c = readContract(repo);
        const noise = c.states.find((s) => s.id === state)?.noise ?? c.diff?.noise ?? DEFAULT_NOISE;
        const r = regionDiff(baselineFile(repo, state), resolve(capturePath), parseRegion(flag(rest, '--region')), flag(rest, '--out'), Number(noise));
        return console.log(JSON.stringify({ state, ...r }));
      }
      case 'styles': {
        const c = readContract(repo);
        const findings = styleFindings(JSON.parse(readFileSync(resolve(pos[1]), 'utf8')), readTokens(resolve(repo, c.tokens.source)), c.tokens.source);
        console.log(JSON.stringify(findings, null, 2));
        if (findings.length) process.exit(1);
        return;
      }
      case 'touched': {
        const t = touchedStates(repo, pos[1]);
        if (t.missing.length) {
          console.error(`missing before/after captures: ${t.missing.join(', ')}`);
          process.exit(1);
        }
        const file = join(repo, '.claude', 'cycle', pos[1], 'visual', 'touched.json');
        const prior = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
        // Regions a stage wrote stay; the states come from pixels only.
        const touched = { tree: flag(rest, '--tree') || prior.tree || '.', states: t.states, regions: prior.regions || {}, diffs: t.diffs };
        writeFileSync(file, `${JSON.stringify(touched, null, 2)}\n`);
        return console.log(JSON.stringify(touched));
      }
      case 'critic-input':
        return console.log(JSON.stringify(criticInput(repo, pos[1], (flag(rest, '--touched') || '').split(',').filter(Boolean)), null, 2));
      case 'record': {
        const tree = flag(rest, '--tree');
        const r = record(repo, pos[1], JSON.parse(readFileSync(resolve(pos[2]), 'utf8')), tree && resolve(tree));
        for (const p of r.problems) console.log(`problem: ${p}`);
        if (r.problems.length) process.exit(1);
        return console.log(`recorded ${r.recorded.length} decision(s)`);
      }
      case 'approve': return console.log(`baseline: ${approve(repo, pos[1], resolve(pos[2]))}`);
      case 'rollback': return console.log(`restored ${rollback(repo, pos[1], pos[2])}`);
      case 'rate': return console.log(JSON.stringify(rate(repo, pos[1], pos[2])));
      case 'agreement': return console.log(JSON.stringify(agreement(repo)));
      case 'status': return console.log(JSON.stringify(visualStatus(repo)));
      default:
        console.error('usage: visual.mjs <contract|drift|capture|fresh|diff|styles|critic-input|record|approve|rollback|rate|agreement> <repo> [args]');
        process.exit(2);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
