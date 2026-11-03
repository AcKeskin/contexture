#!/usr/bin/env node
// Run-state helper for /cycle. Deterministic file work only: the driver skill
// decides, this script records and checks. Run state lives in
// <root>/.claude/cycle/<run>/ (gitignored in the target repo).
//
// Usage: node cycle-state.mjs <command> <run> [--root <repo>]
//   init <run>         create the run folder from the defaults
//   check <run>        exit 1 while any completion item lacks evidence
//   status <run>       print files, completion count and open cards
//   log <run> <text>   append one line to log.md
//   decide <run> <stage> <decision> --why <w> --evidence <e> --result <r> [--supersedes <id>]
//                      append one row to decisions.tsv
//   trail <run>        exit 1 while a live decision row lacks evidence or a pointer does not resolve
//   setup-check <run>  check declared paths, commands and write scope; exit 1 on gaps
//   template <run>     print Claude Code Project instructions filled from the run
//   outcome <run> <stage> <state> [note]  record a stage outcome in <run>/outcome-<stage>.json
//   remove-worktree <run> <path>  unlink outside links (never follow them), then git worktree remove

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync, copyFileSync, realpathSync, lstatSync, readlinkSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, dirname, delimiter, isAbsolute, resolve, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULTS = join(HERE, 'contract-defaults.md');
const TEMPLATE = join(HERE, 'projects-template.md');
// Claude Code Projects cap project instructions at 16,000 characters.
export const TEMPLATE_LIMIT = 16000;
const RUN_ID = /^[a-z0-9][a-z0-9-]*$/;

const SETUP_TEMPLATE = `---
paths:
commands:
env:
write_scope:
  base_branch:
  run_branch: after-slice
---
# Setup

Declare what the run needs before the audit. \`paths\` are checked on disk; \`commands\` must resolve on PATH (first word) and carry no env prefix (put variables under \`env:\`). A \`smoke\` command runs once and records the baseline. \`run_branch: after-slice\` names the branch after the slice; it must never equal the base branch.
`;

// --- tiny frontmatter reader: two levels of "key: value" ----------------------

/** Parses the leading --- block into { key: value | { key: value } }. */
export function readFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  let parent = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const nested = /^\s+/.test(raw);
    const kv = raw.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    const quoted = value.match(/^(["'])(.*)\1$/);
    const val = quoted ? quoted[2] : value;
    if (nested && parent) {
      out[parent][key] = val;
    } else if (val === '') {
      out[key] = {};
      parent = key;
    } else {
      out[key] = val;
      parent = null;
    }
  }
  return out;
}

/** Completion items from contract.md: [{ id, item, evidence }]. */
export function readCompletion(text) {
  const section = text.split(/^## Completion items\s*$/m)[1];
  if (!section) return [];
  const items = [];
  for (const line of section.split(/\r?\n/)) {
    if (/^## /.test(line)) break;
    const id = line.match(/^- id:\s*(.*)$/);
    const field = line.match(/^\s+(item|evidence):\s*(.*)$/);
    if (id) items.push({ id: id[1].trim(), item: '', evidence: '' });
    else if (field && items.length) items[items.length - 1][field[1]] = field[2].trim();
  }
  return items;
}

// --- commands -----------------------------------------------------------------

function runDir(root, run) {
  return join(root, '.claude', 'cycle', run);
}

function stamp() {
  return `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function init(dir) {
  if (existsSync(dir)) fail(`run already exists: ${dir}`);
  mkdirSync(join(dir, 'cards'), { recursive: true });
  writeFileSync(join(dir, 'setup.md'), SETUP_TEMPLATE);
  writeFileSync(join(dir, 'audit.md'), '# Audit\n\n## Missing\n\n## Polish\n\n## Adapt\n\n## Confirmed slice\n');
  copyFileSync(DEFAULTS, join(dir, 'contract.md'));
  writeFileSync(join(dir, 'log.md'), `# Log\n\n- ${stamp()} init\n`);
  console.log(`created ${dir}`);
}

function check(dir) {
  const items = readCompletion(read(join(dir, 'contract.md')));
  if (!items.length) fail('contract.md has no completion items');
  const missing = items.filter((i) => !i.evidence);
  for (const i of missing) console.log(`missing evidence: ${i.id} - ${i.item}`);
  if (missing.length) process.exit(1);
  console.log(`all ${items.length} completion items have evidence`);
}

function openCards(dir) {
  const cards = join(dir, 'cards');
  if (!existsSync(cards)) return [];
  return readdirSync(cards)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => readFrontmatter(read(join(cards, f))).status === 'open');
}

function status(dir) {
  for (const f of ['setup.md', 'audit.md', 'contract.md', 'log.md']) {
    console.log(`${existsSync(join(dir, f)) ? 'ok     ' : 'missing'} ${f}`);
  }
  const trailFile = join(dir, 'decisions.tsv');
  console.log(`decisions: ${existsSync(trailFile) ? readTrail(read(trailFile)).length : 0}`);
  const items = readCompletion(read(join(dir, 'contract.md')));
  console.log(`completion: ${items.filter((i) => i.evidence).length}/${items.length} with evidence`);
  const open = openCards(dir);
  console.log(`open cards: ${open.length ? open.join(', ') : 'none'}`);
}

function log(dir, text) {
  if (!text) fail('log needs a line of text');
  appendFileSync(join(dir, 'log.md'), `- ${stamp()} ${text}\n`);
}

// --- decision trail -----------------------------------------------------------

export const TRAIL_COLUMNS = ['id', 'ts', 'stage', 'decision', 'why', 'evidence', 'result', 'supersedes'];
const TRAIL_FLAGS = ['why', 'evidence', 'result', 'supersedes'];

/** One TSV cell: single line, no tabs, and no leading byte a spreadsheet reads as a formula. */
export function cell(value) {
  const flat = String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  return /^[=+\-@"]/.test(flat) ? `'${flat}` : flat;
}

/** Splits `--flag value` pairs out of args: { flags, rest }. */
export function readFlags(args, names) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const name = args[i].startsWith('--') ? args[i].slice(2) : null;
    if (name && names.includes(name)) flags[name] = args[++i] ?? '';
    else rest.push(args[i]);
  }
  return { flags, rest };
}

/** Rows of decisions.tsv as objects keyed by TRAIL_COLUMNS. */
export function readTrail(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [TRAIL_COLUMNS[i], v])));
}

/**
 * Why one evidence pointer does not resolve, or null when it does.
 * Accepted: a URL or `#123` (not fetched), a commit sha in the repo, a path (from the repo or the run folder) with an optional `:line`.
 */
export function pointerProblem(pointer, root, dir, hasCommit) {
  const p = pointer.trim();
  if (/^https?:\/\//.test(p) || /^(PR )?#\d+$/.test(p)) return null;
  if (/^[0-9a-f]{7,40}$/.test(p)) return hasCommit(p) ? null : `no commit ${p}`;
  const m = p.match(/^(.+?)(?::(\d+)(?:-\d+)?)?$/);
  const file = [isAbsolute(m[1]) ? m[1] : null, join(root, m[1]), join(dir, m[1])].find((f) => f && existsSync(f));
  if (!file) return /[\\/.]/.test(m[1]) ? `no file ${m[1]}` : `not a pointer: ${p}`;
  if (m[2] && statSync(file).isFile() && readFileSync(file, 'utf8').split('\n').length < Number(m[2])) return `${m[1]} has no line ${m[2]}`;
  return null;
}

/** Problems with the trail: [string]. Superseded rows are history and are not checked. */
export function trailProblems(rows, root, dir, hasCommit) {
  if (!rows.length) return ['no decisions logged'];
  const ids = new Set(rows.map((r) => r.id));
  const superseded = new Set(rows.map((r) => r.supersedes).filter(Boolean));
  const out = [];
  for (const r of rows) {
    if (r.supersedes && !ids.has(r.supersedes)) out.push(`row ${r.id}: supersedes unknown row ${r.supersedes}`);
    if (superseded.has(r.id)) continue;
    if (!r.evidence) { out.push(`row ${r.id}: no evidence (${r.decision})`); continue; }
    for (const ptr of r.evidence.split(/,\s*/)) {
      const why = pointerProblem(ptr, root, dir, hasCommit);
      if (why) out.push(`row ${r.id}: ${why}`);
    }
  }
  return out;
}

function decide(dir, args) {
  const { flags, rest } = readFlags(args, TRAIL_FLAGS);
  const [stage, ...words] = rest;
  if (!/^[0-5]v?$/.test(stage ?? '') || !words.length) fail('decide needs <stage> <decision> --why <w> --evidence <e> --result <r>');
  if (!flags.why) fail('decide needs --why');
  const file = join(dir, 'decisions.tsv');
  if (!existsSync(file)) writeFileSync(file, TRAIL_COLUMNS.join('\t') + '\n');
  const rows = readTrail(readFileSync(file, 'utf8'));
  if (flags.supersedes && !rows.some((r) => r.id === flags.supersedes)) fail(`no row ${flags.supersedes} to supersede`);
  const id = String(rows.length + 1);
  const row = [id, new Date().toISOString().slice(0, 19) + 'Z', stage, words.join(' '), flags.why, flags.evidence, flags.result, flags.supersedes];
  appendFileSync(file, row.map(cell).join('\t') + '\n');
  console.log(`row ${id}`);
}

function trail(dir, root) {
  const file = join(dir, 'decisions.tsv');
  const rows = existsSync(file) ? readTrail(readFileSync(file, 'utf8')) : [];
  const hasCommit = (sha) => spawnSync('git', ['-C', root, 'cat-file', '-e', `${sha}^{commit}`]).status === 0;
  const problems = trailProblems(rows, root, dir, hasCommit);
  for (const p of problems) console.log(p);
  if (problems.length) process.exit(1);
  console.log(`trail: ${rows.length} rows, every live row has evidence that resolves`);
}

/** Reads an env var. A copied Windows env keeps the shell's spelling (`Path`), so match case-insensitively there. */
export function envVar(env, name, platform = process.platform) {
  if (platform !== 'win32') return env[name];
  const key = Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : env[key];
}

/** True when the first word of cmd is an existing path or a file on PATH. */
export function resolvesOnPath(cmd, env = process.env) {
  const word = cmd.trim().split(/\s+/)[0];
  if (!word) return false;
  if (isAbsolute(word) || word.includes('/') || word.includes('\\')) return existsSync(word);
  const exts = process.platform === 'win32' ? ['', ...(envVar(env, 'PATHEXT') || '.EXE;.CMD;.BAT').toLowerCase().split(';')] : [''];
  for (const d of (envVar(env, 'PATH') || '').split(delimiter)) {
    for (const ext of exts) {
      const p = join(d, word + ext);
      if (existsSync(p) && statSync(p).isFile()) return true;
    }
  }
  return false;
}

/** The environment declared commands run with: the process env plus setup's `env:` block. */
export function setupEnv(fm, base = process.env, platform = process.platform) {
  const declared = fm.env || {};
  const env = { ...base };
  // On Windows a declared PATH must replace the shell's Path, not sit beside it.
  if (platform === 'win32') {
    for (const k of Object.keys(env)) {
      if (Object.keys(declared).some((d) => d.toUpperCase() === k.toUpperCase())) delete env[k];
    }
  }
  return { ...env, ...declared };
}

/** Gaps in a setup.md frontmatter: [{ key, why }]. Paths resolve against root. */
export function setupGaps(fm, root, env = setupEnv(fm)) {
  const gaps = [];
  for (const [key, p] of Object.entries(fm.paths || {})) {
    if (!p) gaps.push({ key, why: 'no path declared' });
    else if (!existsSync(resolve(root, p))) gaps.push({ key, why: `path not found: ${p}` });
  }
  for (const [key, c] of Object.entries(fm.commands || {})) {
    if (!c) gaps.push({ key, why: 'no command declared' });
    else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(c.trim())) gaps.push({ key, why: 'command starts with an env assignment; move it to env:' });
    else if (!resolvesOnPath(c, env)) gaps.push({ key, why: `command not found: ${c.split(/\s+/)[0]}` });
  }
  const scope = fm.write_scope || {};
  if (!scope.base_branch) gaps.push({ key: 'base_branch', why: 'no base branch declared' });
  if (!scope.run_branch) gaps.push({ key: 'run_branch', why: 'no run branch declared (use after-slice to name it after the slice)' });
  if (scope.base_branch && scope.base_branch === scope.run_branch) {
    gaps.push({ key: 'run_branch', why: 'run branch equals the base branch' });
  }
  return gaps;
}

/** The setup.md section recording the smoke command's result before any change. */
export function baselineSection(cmd, code, stdout, stderr = '') {
  const last = (text, n) => text.trim().split(/\r?\n/).filter(Boolean).slice(-n).join('\n');
  const tail = [last(stdout, 5), stderr.trim() ? `stderr:\n${last(stderr, 3)}` : ''].filter(Boolean).join('\n');
  return `\n## Baseline\n\n\`${cmd}\` exited ${code}${code === 0 ? ' (green)' : ' (red)'}.\n\n\`\`\`\n${tail}\n\`\`\`\n`;
}

const SMOKE_TIMEOUT_MS = 10 * 60 * 1000;

function runSmoke(cmd, root, env) {
  const r = spawnSync(cmd, { cwd: root, env, shell: true, encoding: 'utf8', timeout: SMOKE_TIMEOUT_MS });
  const code = r.status ?? 1;
  return { code, stdout: r.stdout || '', stderr: `${r.stderr || ''}${r.error ? `\n${r.error.message}` : ''}` };
}

/** True when the repo tracks files under .claude/ but a new file there would be ignored. */
export function claudeDirIgnored(root) {
  const git = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });
  if (git('rev-parse', '--git-dir').status !== 0) return false;
  const tracked = git('ls-files', '.claude').stdout.trim() !== '';
  return tracked && git('check-ignore', '-q', '.claude/specs/new-file.md').status === 0;
}

function writeCard(dir, name, kind, title, body) {
  writeFileSync(join(dir, 'cards', name), `---\nkind: ${kind}\nstatus: open\nstage: setup\n---\n# ${title}\n\n${body}\n`);
}

function setupCheck(dir, root) {
  const file = join(dir, 'setup.md');
  const text = read(file);
  const fm = readFrontmatter(text);
  const env = setupEnv(fm);
  const gaps = setupGaps(fm, root, env);
  let body = text.replace(/\n## (Baseline|Gaps)[\s\S]*$/, '');
  const smoke = fm.commands?.smoke;
  if (smoke && !gaps.some((g) => g.key === 'smoke')) {
    const { code, stdout, stderr } = runSmoke(smoke, root, env);
    body += baselineSection(smoke, code, stdout, stderr);
    if (code !== 0) gaps.push({ key: 'smoke', why: `baseline red: \`${smoke}\` exited ${code}` });
  }
  const rows = gaps.map((g) => `| ${g.key} | ${g.why} |`).join('\n');
  writeFileSync(file, gaps.length ? `${body}\n## Gaps\n\n| Item | Gap |\n|---|---|\n${rows}\n` : body);
  const cards = join(dir, 'cards');
  for (const f of readdirSync(cards).filter((n) => n.startsWith('setup-'))) {
    if (!gaps.some((g) => f === `setup-${g.key}.md`)) {
      const p = join(cards, f);
      writeFileSync(p, read(p).replace(/^status: open$/m, 'status: resolved'));
    }
  }
  for (const g of gaps) {
    writeCard(dir, `setup-${g.key}.md`, 'block', `Setup gap: ${g.key}`, `${g.why}. Fix it in setup.md, then run setup-check again.`);
    console.log(`gap: ${g.key} - ${g.why}`);
  }
  if (claudeDirIgnored(root)) {
    writeCard(dir, 'ignored-claude-dir.md', 'card', '.claude/ is ignored but tracked',
      'A global ignore covers .claude/, but this repo tracks files there. Add new spec and plan files with `git add -f`, or they will be left out.');
    console.log('warning: .claude/ is ignored here; new spec/plan files need git add -f');
  }
  if (gaps.length) process.exit(1);
  console.log('setup complete');
}

const OUTCOMES = ['done', 'blocked', 'stuck', 'budget', 'idle', 'error'];

/** Records one stage's outcome in its own file. The loop alone writes loop.json, so a heartbeat cannot erase it. */
function outcome(dir, run, stage, state, note) {
  if (!/^[0-5]$/.test(stage || '')) fail('outcome needs a stage number 0-5');
  if (!OUTCOMES.includes(state)) fail(`outcome must be one of: ${OUTCOMES.join(', ')}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `outcome-${stage}.json`), `${JSON.stringify({ outcome: state, note: note || '', at: new Date().toISOString() }, null, 2)}\n`);
  // The path, so a stage can see where its outcome went.
  console.log(`run ${run} stage ${stage}: ${state} (${join(dir, `outcome-${stage}.json`)})`);
}

const inside = (root, p) => {
  const rel = relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/**
 * Symlinks and junctions under dir that point outside it: [{ link, target }].
 * Never follows a link. A worktree whose node_modules links to the main checkout
 * is the case this guards: removing that worktree deletes through the link.
 */
export function linksOutside(dir) {
  const root = realpathSync(dir);
  const found = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) {
        let target;
        try { target = realpathSync(p); } catch { target = resolve(d, readlinkSync(p)); }
        if (!inside(root, target)) found.push({ link: p, target });
      } else if (st.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return found;
}

/** Removes a link without touching what it points to: unlink for file links, rmdir for directory links and junctions. */
export function unlinkOnly(link) {
  try { unlinkSync(link); } catch { rmdirSync(link); }
}

/** Unlinks every outside link in a run's worktree, then removes the worktree. */
function removeWorktree(dir, root, path) {
  const wt = resolve(root, path);
  if (!inside(dir, wt) || wt === dir) fail(`refusing to remove ${wt}: not a folder inside ${dir}`);
  for (const { link, target } of existsSync(wt) ? linksOutside(wt) : []) {
    unlinkOnly(link);
    console.log(`unlinked ${link} -> ${target}`);
  }
  const r = spawnSync('git', ['-C', root, 'worktree', 'remove', '--force', wt], { encoding: 'utf8' });
  spawnSync('git', ['-C', root, 'worktree', 'prune']);
  if (r.status !== 0) fail(`git worktree remove failed: ${(r.stderr || '').trim()}`);
  console.log(`removed worktree ${wt}`);
}

/** The escalation rows of contract.md as "- trigger: action" lines. */
function escalationLines(text) {
  const section = text.split(/^## Escalation\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  return section.split(/\r?\n/)
    .map((l) => l.match(/^\|\s*([^|]+?)\s*\|\s*(block|card)\s*\|/))
    .filter(Boolean)
    .map((m) => `- ${m[1]}: ${m[2]}`)
    .join('\n');
}

/** Project instructions for a run, filled from its setup.md and contract.md. */
export function renderTemplate(template, setupText, contractText, repo, run) {
  const scope = readFrontmatter(setupText).write_scope || {};
  const fields = {
    repo,
    run,
    base_branch: scope.base_branch || '<base branch>',
    run_branch: scope.run_branch || '<run branch>',
    retry_cap: readFrontmatter(contractText).retry_cap || '3',
    escalation: escalationLines(contractText),
    completion: readCompletion(contractText).map((i) => `- ${i.item}`).join('\n'),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => fields[k] ?? '');
}

function template(dir, root, run) {
  const text = renderTemplate(read(TEMPLATE), read(join(dir, 'setup.md')), read(join(dir, 'contract.md')), basename(root), run);
  if (text.length > TEMPLATE_LIMIT) fail(`template is ${text.length} characters; Projects allow ${TEMPLATE_LIMIT}`);
  process.stdout.write(text);
}

// --- entry ------------------------------------------------------------------

function read(file) {
  if (!existsSync(file)) fail(`missing ${file}`);
  return readFileSync(file, 'utf8');
}

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

/**
 * The repo that holds this run: the nearest folder at or above `from` with `.claude/cycle/<run>/setup.md`.
 * A stage that cd'd into its worktree or the run folder would otherwise write to a folder the loop never reads.
 */
export function findRoot(from, run) {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(runDir(dir, run), 'setup.md'))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

function main(argv) {
  const rootAt = argv.indexOf('--root');
  const args = rootAt >= 0 ? argv.filter((_, i) => i !== rootAt && i !== rootAt + 1) : argv;
  const [cmd, run, ...rest] = args;
  if (!run || !RUN_ID.test(run)) fail('usage: cycle-state.mjs <init|check|status|log|decide|trail|setup-check|template|outcome|remove-worktree> <run> [--root <repo>]');
  let root = rootAt >= 0 ? resolve(argv[rootAt + 1]) : null;
  if (!root && cmd === 'init') root = process.cwd();
  if (!root) root = findRoot(process.cwd(), run) ?? fail(`no run ${run} at or above ${process.cwd()}: pass --root <repo>`);
  const dir = runDir(root, run);
  if (cmd !== 'init' && !existsSync(join(dir, 'setup.md'))) fail(`no run at ${dir}`);
  switch (cmd) {
    case 'init': return init(dir);
    case 'check': return check(dir);
    case 'status': return status(dir);
    case 'log': return log(dir, rest.join(' '));
    case 'decide': return decide(dir, rest);
    case 'trail': return trail(dir, root);
    case 'setup-check': return setupCheck(dir, root);
    case 'template': return template(dir, root, run);
    case 'outcome': return outcome(dir, run, rest[0], rest[1], rest.slice(2).join(' '));
    case 'remove-worktree': return removeWorktree(dir, root, rest[0] || fail('remove-worktree needs a path'));
    default: return fail(`unknown command: ${cmd}`);
  }
}

// realpath both sides: bootstrap links this script through ~/.claude, and a
// symlinked argv[1] never equals the real module path, which made the CLI a silent no-op.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
