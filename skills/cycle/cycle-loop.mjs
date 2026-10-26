#!/usr/bin/env node
// The unattended /cycle loop. Runs one headless Claude session per stage, run
// after run, until a stop condition. The script owns the loop state (loop.json),
// the slice pick, pushes and draft PRs; a stage only writes its outcome.
//
// Usage: node cycle-loop.mjs <command> [repo]
//   run [repo]     start or resume the loop (default repo: cwd)
//   status [repo]  print the digest's head and the heartbeat
//   watch [repo]   follow the current stage's feed
//   stop [repo]    write the STOP file; the loop stops after the current stage
//
// Test seams: CYCLE_CLAUDE (command run instead of `claude`), CYCLE_GH (instead
// of `gh`), CYCLE_NOTIFY_LOG (append notifications to this file instead of sending),
// CYCLE_LIMIT_WAIT_MS (wait after a usage-limit result), CYCLE_HEARTBEAT_MS (heartbeat interval).

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, copyFileSync, statSync, realpathSync, rmSync } from 'node:fs';
import { join, dirname, resolve, basename, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFrontmatter, linksOutside, unlinkOnly, setupEnv } from './cycle-state.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_SCRIPT = join(HERE, 'cycle-state.mjs');
const PAGE = join(HERE, 'status-page.html');
const VISUAL_SCRIPT = join(HERE, '..', 'visual', 'visual.mjs');
const heartbeatMs = () => Number(process.env.CYCLE_HEARTBEAT_MS || 30 * 1000);
const DEFAULT_LIMIT_WAIT_MS = 30 * 60 * 1000;
const USAGE_LIMIT = /usage limit|rate limit reached|limit will reset|out of extra usage/i;
const AUTH_FAILED = /failed to authenticate|not logged in|oauth session expired|invalid api key/i;

const DEFAULTS = {
  max_runs: 5, max_hours: 20, stage_budget_usd: 5, total_budget_usd: 40, max_open_prs: 3,
  slice_effort: 'S,M', never_touch: '', github: 'none', base_branch: 'main', run_branch_prefix: 'feat/, fix/',
  max_usage_5h: 70, max_usage_7d: 50,
  models_audit: 'opus', models_work: 'auto', models_S: 'sonnet', models_M: 'sonnet', models_L: 'opus', models_critic: 'opus', models_review: 'opus',
  merge: 'off', merge_label: 'cycle-merge', merge_method: 'squash', merge_needs_critic: 'yes', merge_ci_wait_min: 30,
  port: 7777, notify_channels: 'toast', notify_events: 'parked,pr,stopped',
};

// --- paths and files -----------------------------------------------------------

const cycleDir = (repo) => join(repo, '.claude', 'cycle');
const runDir = (repo, run) => join(cycleDir(repo), run);
const loopFile = (repo) => join(cycleDir(repo), 'loop.json');

function readJson(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

/** config.md frontmatter over the defaults, with notify.* and models.* flattened. */
export function readConfig(repo) {
  const file = join(cycleDir(repo), 'config.md');
  const fm = existsSync(file) ? readFrontmatter(readFileSync(file, 'utf8')) : {};
  const notify = typeof fm.notify === 'object' ? fm.notify : {};
  const models = typeof fm.models === 'object' ? fm.models : {};
  const cfg = { ...DEFAULTS, ...fm };
  // An empty "key:" line reads as an empty map; for scalar settings it means "no value".
  for (const k of Object.keys(DEFAULTS)) if (typeof cfg[k] === 'object') cfg[k] = '';
  if (notify.channels) cfg.notify_channels = notify.channels;
  if (notify.events) cfg.notify_events = notify.events;
  for (const [k, v] of Object.entries(models)) cfg[`models_${k}`] = v;
  for (const k of ['max_runs', 'max_hours', 'stage_budget_usd', 'total_budget_usd', 'max_open_prs', 'max_usage_5h', 'max_usage_7d', 'merge_ci_wait_min', 'port']) cfg[k] = Number(cfg[k]);
  return cfg;
}

// --- the slice pick (deterministic) ---------------------------------------------

/** Ranked rows from audit.md's `## Ranked` table: [{ id, gap, effort, files, taste, status }]. */
export function readRanked(text) {
  const section = text.split(/^## Ranked\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const rows = section.split(/\r?\n/).filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l));
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.split('|').slice(1, -1).map((c) => c.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(r.split('|').slice(1, -1).map((c, i) => [keys[i], c.trim()])));
}

function globToRegex(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp(`^${esc}$`);
}

/** The first ranked slice the loop may take on its own, or null. */
/** `visual`: the repo has a visual contract, so a `taste: visual` row is pickable and the critic makes that call. */
export function pickSlice(rows, cfg, parked = [], visual = false) {
  const efforts = list(cfg.slice_effort).map((e) => e.toUpperCase());
  const banned = list(cfg.never_touch).map(globToRegex);
  return rows.find((r) => {
    if (!efforts.includes((r.effort || '').toUpperCase())) return false;
    if (/^(yes|y|true)$/i.test(r.taste || '')) return false;
    if (/^visual$/i.test(r.taste || '') && !visual) return false;
    if (/parked|done/i.test(r.status || '') || parked.includes(r.id)) return false;
    return !list(r.files).some((f) => banned.some((re) => re.test(f)));
  }) ?? null;
}

function confirmSlice(repo, run, slice) {
  const audit = join(runDir(repo, run), 'audit.md');
  const text = readFileSync(audit, 'utf8').replace(/\n## Confirmed slice[\s\S]*$/, '');
  writeFileSync(audit, `${text}\n## Confirmed slice\n\n${slice.id}: ${slice.gap} (effort ${slice.effort}, files ${slice.files || 'n/a'})\n`);
  writeFileSync(join(runDir(repo, run), 'cards', 'slice-pick.md'),
    `---\nkind: card\nstatus: open\nstage: audit\n---\n# Slice picked: ${slice.id}\n\n${slice.gap}\n\nPicked by the loop: the top-ranked slice within the effort limit, outside never_touch, not a taste-call. To swap it, write another ranked id under "## Confirmed slice" in audit.md before the plan stage starts.\n`);
}

// --- running one stage ------------------------------------------------------------

/** One readable feed line for a stream-json event, or null to skip it. */
export function feedLine(event) {
  if (event.type === 'assistant') {
    return (event.message?.content || []).map((c) => {
      if (c.type === 'tool_use') {
        const i = c.input || {};
        const what = i.command || i.file_path || i.pattern || i.url || i.description || '';
        return `> ${c.name}: ${String(what).split('\n')[0].slice(0, 160)}`;
      }
      if (c.type === 'text' && c.text.trim()) return `  ${c.text.trim().split('\n')[0].slice(0, 200)}`;
      return null;
    }).filter(Boolean).join('\n') || null;
  }
  if (event.type === 'result') return `= ${event.is_error ? 'error' : 'result'}: ${String(event.result || '').split('\n')[0].slice(0, 200)}`;
  return null;
}

/** Quotes an argument for cmd.exe, which Windows needs to run claude.cmd. */
const winQuote = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

/** The model for a stage: `models.audit` for the audit, else `models.work`; `auto` picks by the slice's effort. '' = CLI default. */
export function stageModel(cfg, stage, effort) {
  if (Number(stage) === 1) return cfg.models_audit || '';
  if (cfg.models_work !== 'auto') return cfg.models_work || '';
  return cfg[`models_${String(effort || '').toUpperCase()}`] || '';
}

/** The effort of the slice under `## Confirmed slice`, so a slice the user swapped in picks its own model. */
export function confirmedEffort(auditText) {
  const id = auditText.split(/^## Confirmed slice\s*$/m)[1]?.match(/\b([A-Z]+\d+)\b/)?.[1];
  return readRanked(auditText).find((r) => r.id === id)?.effort || '';
}

function stageCommand(run, stage, cfg, model, prompt = `/cycle ${run} --stage ${stage}`) {
  const args = ['-p', prompt, '--permission-mode', 'auto', '--output-format', 'stream-json', '--verbose',
    '--max-budget-usd', String(cfg.stage_budget_usd), ...(model ? ['--model', model] : [])];
  const custom = process.env.CYCLE_CLAUDE;
  if (custom) {
    const [cmd, ...pre] = custom.split(' ');
    return { cmd, args: [...pre, ...args] };
  }
  return process.platform === 'win32' ? { cmd: 'claude', args: args.map(winQuote), shell: true } : { cmd: 'claude', args };
}

/** Plan usage from a stream-json rate_limit_event: { five_hour, seven_day } as { utilization 0-1, resets_at ms }. */
export function readUsage(event) {
  const windows = event.rate_limit_info?.unifiedWindows || {};
  const usage = {};
  for (const name of ['five_hour', 'seven_day']) {
    const w = windows[name];
    if (w && typeof w.utilization === 'number') usage[name] = { utilization: w.utilization, resets_at: Number(w.resetsAt) * 1000 };
  }
  return usage;
}

/** Runs one stage headless, writing its feed; resolves { cost, isError, text, usage }. `prompt` overrides the stage prompt (the visual critic). */
function runStage(repo, run, stage, cfg, model, beat, prompt) {
  const feed = join(runDir(repo, run), `stage-${stage}.log`);
  appendFileSync(feed, `# stage ${stage}, started ${new Date().toISOString()}, model ${model || 'default'}\n`);
  const { cmd, args, shell = false } = stageCommand(run, stage, cfg, model, prompt);
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd: repo, shell, env: process.env });
    let buf = '';
    let result = { cost: 0, isError: true, text: 'no result event' };
    let usage = {};
    const timer = setInterval(beat, heartbeatMs());
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        let event;
        try { event = JSON.parse(line); } catch { appendFileSync(feed, `  ${line}\n`); continue; }
        const text = feedLine(event);
        if (text) appendFileSync(feed, `${text}\n`);
        if (event.type === 'rate_limit_event') usage = { ...usage, ...readUsage(event) };
        if (event.type === 'result') result = { cost: Number(event.total_cost_usd || 0), isError: Boolean(event.is_error), text: String(event.result || '') };
      }
    });
    child.stderr.on('data', (chunk) => appendFileSync(feed, `! ${String(chunk).trim()}\n`));
    child.on('close', (code) => {
      clearInterval(timer);
      if (code !== 0 && !result.isError) result = { ...result, isError: true, text: `exit ${code}` };
      done({ ...result, usage });
    });
  });
}

// --- git, push and PRs ---------------------------------------------------------------

const git = (repo, ...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });

/** True when a branch name starts with one of the comma-separated `run_branch_prefix` values. */
export const isRunBranch = (cfg, branch) => list(cfg.run_branch_prefix).some((p) => branch.startsWith(p));

/** .git/config without the `[branch "<prefix>..."]` sections (one prefix, a comma list, or an array): run branches write those when a stage cuts them. */
export function configWithoutRunBranches(text, prefix) {
  if (!prefix || !prefix.length) return text;
  const out = [];
  const prefixes = Array.isArray(prefix) ? prefix : list(prefix);
  let skip = false;
  for (const line of text.split(/\r?\n/)) {
    const section = line.match(/^\s*\[(.*)\]\s*$/);
    if (section) skip = prefixes.some((p) => section[1].startsWith(`branch "${p}`));
    // Blank lines carry no settings; dropping them keeps an appended section from shifting the file's last newline.
    if (!skip && line.trim()) out.push(line);
  }
  return out.join('\n');
}

/** A hash of .git/config (minus run-branch sections) and .git/hooks, compared before every push. */
export function gitFingerprint(repo, prefix = '') {
  const gitDir = resolve(repo, git(repo, 'rev-parse', '--git-dir').stdout.trim() || '.git');
  const h = createHash('sha256');
  const config = join(gitDir, 'config');
  if (existsSync(config)) h.update(configWithoutRunBranches(readFileSync(config, 'utf8'), prefix));
  const hooks = join(gitDir, 'hooks');
  if (existsSync(hooks)) {
    for (const f of readdirSync(hooks).sort()) {
      const p = join(hooks, f);
      if (statSync(p).isFile()) h.update(f).update(readFileSync(p));
    }
  }
  return h.digest('hex');
}

function ghCommand() {
  const custom = process.env.CYCLE_GH;
  if (!custom) return { cmd: 'gh', pre: [] };
  const [cmd, ...pre] = custom.split(' ');
  return { cmd, pre };
}

function gh(repo, ...a) {
  const { cmd, pre } = ghCommand();
  return spawnSync(cmd, [...pre, ...a], { cwd: repo, encoding: 'utf8' });
}

/** Open PRs from branches this loop published; the user's own feat/ or fix/ PRs do not count. */
function openCyclePrs(repo, loop) {
  const r = gh(repo, 'pr', 'list', '--state', 'open', '--json', 'headRefName');
  if (r.status !== 0) return Infinity;
  const mine = new Set(Object.values(loop.runs || {}).map((run) => run.branch).filter(Boolean));
  return JSON.parse(r.stdout || '[]').filter((p) => mine.has(p.headRefName)).length;
}

/** Pushes the run branch and opens a draft PR, as config allows. Returns a digest note. */
function publish(repo, run, branch, cfg, loop) {
  if (cfg.github === 'none') return 'kept local (github: none)';
  if (!branch || !isRunBranch(cfg, branch) || branch === cfg.base_branch) return `not pushed: branch "${branch}" does not start with ${cfg.run_branch_prefix}`;
  if (gitFingerprint(repo, cfg.run_branch_prefix) !== loop.git_fingerprint) return 'STOP:.git/config or .git/hooks changed since the loop started';
  // No -u: setting an upstream writes .git/config, which the fingerprint check guards.
  const push = git(repo, 'push', 'origin', `${branch}:refs/heads/${branch}`);
  if (push.status !== 0) return `push failed: ${push.stderr.trim().split('\n').pop()}`;
  if (cfg.github !== 'push+draft-pr') return `pushed ${branch}`;
  // A rerun (review changes, a late critic): the push updated the PR already open for this branch.
  const open = gh(repo, 'pr', 'list', '--state', 'open', '--head', branch, '--json', 'url');
  const existing = open.status === 0 ? JSON.parse(open.stdout || '[]')[0]?.url : null;
  if (existing) return `PR:${existing}`;
  if (openCyclePrs(repo, loop) >= cfg.max_open_prs) return `pushed ${branch}; draft PR waits (${cfg.max_open_prs} open)`;
  const prFile = join(runDir(repo, run), 'pr.md');
  if (!existsSync(prFile)) return `pushed ${branch}; no pr.md, no PR`;
  const [first, ...rest] = readFileSync(prFile, 'utf8').split(/\r?\n/);
  const body = join(runDir(repo, run), 'pr-body.md');
  writeFileSync(body, rest.join('\n').trim() + '\n');
  const pr = gh(repo, 'pr', 'create', '--draft', '--base', cfg.base_branch, '--head', branch, '--title', first.replace(/^#\s*/, ''), '--body-file', body);
  return pr.status === 0 ? `PR:${pr.stdout.trim()}` : `pushed ${branch}; PR failed: ${pr.stderr.trim()}`;
}

function commitsAhead(repo, branch, cfg) {
  if (!branch) return 0;
  const base = git(repo, 'rev-parse', '--verify', '-q', `origin/${cfg.base_branch}`).status === 0 ? `origin/${cfg.base_branch}` : cfg.base_branch;
  const r = git(repo, 'rev-list', '--count', `${base}..${branch}`);
  return r.status === 0 ? Number(r.stdout.trim()) : 0;
}

// --- notifications ------------------------------------------------------------------

/** Sends one message for an event on every chosen channel, if the event is chosen. */
export function notify(cfg, event, message) {
  if (!list(cfg.notify_events).includes(event)) return;
  const text = `cycle ${event}: ${message}`;
  for (const channel of list(cfg.notify_channels)) {
    if (process.env.CYCLE_NOTIFY_LOG) {
      appendFileSync(process.env.CYCLE_NOTIFY_LOG, `${channel}\t${text}\n`);
      continue;
    }
    if (channel === 'toast') toast(text);
    else if (channel.startsWith('ntfy:')) post(channel.slice(5), text, 'text/plain');
    else if (channel.startsWith('webhook:')) post(channel.slice(8), JSON.stringify({ content: text, text }), 'application/json');
  }
}

function toast(text) {
  if (process.platform !== 'win32') return;
  const safe = text.replace(/[<>&'"]/g, ' ');
  const ps = `[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]>$null;` +
    `$x=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(1);` +
    `$x.GetElementsByTagName('text')[0].AppendChild($x.CreateTextNode('${safe}'))>$null;` +
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude cycle').Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
  spawnSync('powershell', ['-NoProfile', '-Command', ps], { timeout: 15000 });
}

function post(url, body, type) {
  fetch(url, { method: 'POST', headers: { 'Content-Type': type }, body }).catch((err) => {
    console.error(`notify failed for ${new URL(url).host}: ${err.message}`);
  });
}

// --- digest and status --------------------------------------------------------------

/** Notices, not decisions: shown apart and never counted as waiting on the user. */
const INFO_CARDS = new Set(['ignored-claude-dir.md']);

/** True once a run is past planning (or over), when its slice pick can no longer be swapped. */
const pastPlanning = (run) => Boolean(run && (run.finished || run.stages?.[2]?.outcome === 'done'));

/** Open cards across runs. `loop` lets a slice-pick card close once its run is past planning. */
function openCards(repo, loop = readJson(loopFile(repo), {})) {
  const out = [];
  if (!existsSync(cycleDir(repo))) return out;
  for (const run of readdirSync(cycleDir(repo))) {
    const cards = join(runDir(repo, run), 'cards');
    if (!existsSync(cards)) continue;
    for (const f of readdirSync(cards)) {
      if (f === 'slice-pick.md' && pastPlanning(loop.runs?.[run])) continue;
      const text = readFileSync(join(cards, f), 'utf8');
      const fm = readFrontmatter(text);
      const title = text.match(/^# (.+)$/m)?.[1].trim() || '';
      const kind = INFO_CARDS.has(f) ? 'info' : fm.kind;
      if (fm.status === 'open') out.push({ run, card: f, kind, title });
    }
  }
  return out;
}

/** Marks one of a run's cards resolved, when it no longer asks anything. */
function resolveCard(repo, run, name) {
  const p = join(runDir(repo, run), 'cards', name);
  if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf8').replace(/^status: open$/m, 'status: resolved'));
}

// --- PR state (read-only gh, cached so the page can poll) ----------------------------------

const PR_CACHE_MS = 60 * 1000;
const prCache = new Map();

/** The live state of one PR: { state, draft, merged, checks: { pass, fail, pending } }, or { error }. */
export function prState(repo, url, now = Date.now()) {
  const hit = prCache.get(url);
  if (hit && now - hit.at < PR_CACHE_MS) return hit.data;
  const r = gh(repo, 'pr', 'view', url, '--json', 'state,isDraft,mergedAt,statusCheckRollup');
  let data;
  if (r.status !== 0) data = { error: (r.stderr || '').trim().split(/\r?\n/).pop() || `gh exit ${r.status}` };
  else {
    const pr = JSON.parse(r.stdout || '{}');
    const checks = { pass: 0, fail: 0, pending: 0 };
    for (const c of pr.statusCheckRollup || []) {
      const v = String(c.conclusion || c.state || c.status || '').toUpperCase();
      if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(v)) checks.pass += 1;
      else if (['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(v)) checks.fail += 1;
      else checks.pending += 1;
    }
    data = { state: String(pr.state || '').toLowerCase(), draft: Boolean(pr.isDraft), merged: Boolean(pr.mergedAt), checks };
  }
  prCache.set(url, { at: now, data });
  return data;
}

/** PR state for every run that opened one: { <url>: state }. */
export function prsJson(repo) {
  const loop = readJson(loopFile(repo), {});
  const out = {};
  for (const r of Object.values(loop.runs || {})) {
    const url = String(r.published || '').match(/https:\/\/\S+\/pull\/\d+/)?.[0];
    if (url) out[url] = prState(repo, url);
  }
  return out;
}

/** The digest, regenerated from loop.json and the cards after every stage. */
export function renderDigest(loop, cards) {
  const state = loop.stop ? `stopped: ${loop.stop}` : loop.waiting ? `waiting: ${loop.waiting}` : `running, heartbeat ${loop.heartbeat}`;
  const blocks = cards.filter((c) => c.kind === 'block');
  const usage = ['five_hour', 'seven_day'].filter((w) => loop.usage?.[w]).map((w) => ` · ${w === 'five_hour' ? '5h' : '7d'} ${pct(loop.usage[w].utilization)}`).join('');
  const lines = [`# Cycle digest`, '', `**${state}** · runs ${Object.keys(loop.runs || {}).length} · cost $${(loop.total_cost || 0).toFixed(2)}${usage}`, ''];
  lines.push('## Look at this first', '');
  if (!blocks.length && !(loop.parked || []).length) lines.push('- nothing waiting on you');
  for (const c of blocks) lines.push(`- block card \`${c.run}/cards/${c.card}\``);
  for (const p of loop.parked || []) lines.push(`- parked slice ${p.slice}: ${p.reason}`);
  lines.push('');
  for (const [id, r] of Object.entries(loop.runs || {}).reverse()) {
    lines.push(`## ${id}`, '', `- slice: ${r.slice || 'not picked'}`, `- branch: ${r.branch || 'none'}`, `- published: ${r.published || 'not yet'}`, `- cost: $${(r.cost || 0).toFixed(2)}`);
    for (const [n, s] of Object.entries(r.stages || {})) lines.push(`- stage ${n}: ${s.outcome}${s.note ? ` (${s.note})` : ''}`);
    lines.push('');
  }
  return lines.join('\n');
}

function save(repo, loop) {
  loop.heartbeat = new Date().toISOString();
  writeJson(loopFile(repo), loop);
  writeFileSync(join(cycleDir(repo), 'digest.md'), renderDigest(loop, openCards(repo)));
}

function currentFeed(repo, loop) {
  const run = loop.current_run;
  if (!run || !existsSync(runDir(repo, run))) return '';
  const logs = readdirSync(runDir(repo, run)).filter((f) => /^stage-\dv?\.log$/.test(f)).sort();
  if (!logs.length) return '';
  return readFileSync(join(runDir(repo, run), logs.at(-1)), 'utf8').split('\n').slice(-200).join('\n');
}

/** The JSON the status page polls. */
export function statusJson(repo) {
  const loop = readJson(loopFile(repo), {});
  const cfg = readConfig(repo);
  const limits = Object.fromEntries(['max_runs', 'max_hours', 'total_budget_usd', 'max_usage_5h', 'max_usage_7d'].map((k) => [k, cfg[k]]));
  // The confirmed slice's line per run, so the page can name the work, not only its id.
  const slices = {};
  for (const id of Object.keys(loop.runs || {})) {
    const audit = join(runDir(repo, id), 'audit.md');
    const line = existsSync(audit) ? readFileSync(audit, 'utf8').split(/^## Confirmed slice\s*$/m)[1]?.trim().split(/\r?\n/)[0] : '';
    if (line) slices[id] = line;
  }
  return { repo: basename(repo), loop, cards: openCards(repo, loop), feed: currentFeed(repo, loop), limits, slices };
}

/** A repo-relative path under .claude/visual or .claude/cycle, resolved; null for anything else. */
export function visualFilePath(repo, rel) {
  const p = resolve(repo, String(rel || ''));
  const allowed = ['visual', 'cycle'].map((d) => resolve(repo, '.claude', d) + sep);
  return allowed.some((a) => p.startsWith(a)) && extname(p).toLowerCase() === '.png' ? p : null;
}

function sendJson(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** The review actions: rate a decision, roll a state's baseline back. They run the visual script, which owns those files. */
function visualAction(repo, url, body) {
  if (!visualOn(repo)) return [404, { error: 'no visual contract in this repo' }];
  const r = url === '/visual/rate'
    ? visual('rate', repo, String(body.id || ''), String(body.rating || ''))
    : visual('rollback', repo, String(body.state || ''));
  return r.status === 0 ? [200, { ok: true, result: r.stdout.trim() }] : [400, { error: r.stderr.trim() || r.stdout.trim() }];
}

/** Serves the status page, /status.json and the visual review routes on 127.0.0.1 only. */
export function startStatusServer(repo, port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/status.json') return sendJson(res, 200, statusJson(repo));
    if (url.pathname === '/prs.json') return sendJson(res, 200, prsJson(repo));
    if (url.pathname === '/visual.json') {
      if (!visualOn(repo)) return sendJson(res, 200, { enabled: false });
      const r = visual('status', repo);
      return r.status === 0 ? sendJson(res, 200, JSON.parse(r.stdout)) : sendJson(res, 500, { error: r.stderr.trim() });
    }
    if (url.pathname === '/visual-file') {
      const p = visualFilePath(repo, url.searchParams.get('path'));
      if (!p || !existsSync(p)) return sendJson(res, 404, { error: 'not a visual image' });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      return res.end(readFileSync(p));
    }
    if (req.method === 'POST' && ['/visual/rate', '/visual/rollback'].includes(url.pathname)) {
      let raw = '';
      req.on('data', (c) => { raw += c; if (raw.length > 10000) req.destroy(); });
      req.on('end', () => {
        let body;
        try { body = JSON.parse(raw || '{}'); } catch { return sendJson(res, 400, { error: 'body must be JSON' }); }
        const [code, out] = visualAction(repo, url.pathname, body);
        return sendJson(res, code, out);
      });
      return undefined;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(readFileSync(PAGE));
  });
  server.listen(port, '127.0.0.1');
  return server;
}

// --- the loop -------------------------------------------------------------------------

function cycleState(repo, ...args) {
  return spawnSync(process.execPath, [STATE_SCRIPT, ...args, '--root', repo], { encoding: 'utf8' });
}

function newRun(repo, loop) {
  const n = Object.keys(loop.runs || {}).length + 1;
  const id = `${new Date().toISOString().slice(0, 10)}-run${n}`;
  cycleState(repo, 'init', id);
  const template = join(cycleDir(repo), 'setup.md');
  if (existsSync(template)) copyFileSync(template, join(runDir(repo, id), 'setup.md'));
  loop.runs[id] = { stages: {}, cost: 0, session: loop.started };
  loop.current_run = id;
  return id;
}

/**
 * Unlinks every link in the run folder that points outside it, and leaves a card.
 * A worktree with node_modules linked to the main checkout loses that checkout's
 * files when the worktree is removed, so such a link never outlives its stage.
 */
export function unlinkOutsideLinks(repo, runId) {
  const dir = runDir(repo, runId);
  if (!existsSync(dir)) return [];
  const links = linksOutside(dir);
  for (const { link } of links) unlinkOnly(link);
  if (!links.length) return links;
  const list = links.map(({ link, target }) => `- \`${link}\` -> \`${target}\``).join('\n');
  mkdirSync(join(dir, 'cards'), { recursive: true });
  writeFileSync(join(dir, 'cards', `outside-links-${Date.now()}.md`),
    `---\nkind: card\nstatus: open\nstage: loop\n---\n# Removed links that pointed outside the run folder\n\nThe loop unlinked these after the stage; their targets are untouched. Install dependencies in the worktree with setup's \`install\` command instead of linking them.\n\n${list}\n`);
  appendFileSync(join(dir, 'log.md'), `- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC loop: unlinked ${links.length} link(s) pointing outside the run folder\n`);
  return links;
}

function nextStage(run) {
  const done = Object.entries(run.stages).filter(([, s]) => s.outcome === 'done').map(([n]) => Number(n));
  return done.length ? Math.max(...done) + 1 : 0;
}

function park(loop, runId, reason, cfg) {
  const run = loop.runs[runId];
  (loop.parked ??= []).push({ slice: run.slice || runId, run: runId, reason });
  run.finished = 'parked';
  notify(cfg, 'parked', `${run.slice || runId}: ${reason}`);
}

/** The reason to stop now, or null. */
export function stopReason(repo, loop, cfg, now = Date.now()) {
  if (existsSync(join(cycleDir(repo), 'STOP'))) return 'STOP file';
  if ((loop.session_cost || 0) >= cfg.total_budget_usd) return `total budget $${cfg.total_budget_usd} reached`;
  if (now - Date.parse(loop.started) >= cfg.max_hours * 3600 * 1000) return `${cfg.max_hours} hours passed`;
  // A run waiting for its review and merge is not finished yet.
  const finished = Object.values(loop.runs || {}).filter((r) => r.finished && !r.review_pending && r.session === loop.started).length;
  if (finished >= cfg.max_runs) return `${cfg.max_runs} runs finished`;
  if ((loop.no_change_runs || 0) >= 2) return 'two runs in a row changed no files';
  if ((loop.errors_in_a_row || 0) >= 2) return 'a stage errored twice in a row';
  if (loop.idle) return 'the audit found nothing the loop may take on its own';
  const week = loop.usage?.seven_day;
  if (cfg.max_usage_7d && week && week.resets_at > now && week.utilization * 100 >= cfg.max_usage_7d) {
    return `weekly usage at ${pct(week.utilization)} reached the ${cfg.max_usage_7d}% cap`;
  }
  return null;
}

const pct = (u) => `${Math.round(u * 100)}%`;

/** Milliseconds to wait for the 5-hour window to reset, or 0 when usage is under the cap. */
export function usageWait(loop, cfg, now = Date.now()) {
  const window = loop.usage?.five_hour;
  if (!cfg.max_usage_5h || !window || window.utilization * 100 < cfg.max_usage_5h) return 0;
  return Math.max(0, window.resets_at - now);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sleeps in heartbeat-sized steps so the status page stays live and a STOP file ends the wait. */
async function waitOut(repo, ms, beat) {
  const end = Date.now() + ms;
  while (Date.now() < end && !existsSync(join(cycleDir(repo), 'STOP'))) {
    await sleep(Math.min(heartbeatMs(), end - Date.now()));
    beat();
  }
}

/** Setup stage 0 runs in the script: no model needed. False means the user must fix setup. */
function stageZero(repo, loop, runId) {
  const r = cycleState(repo, 'setup-check', runId);
  loop.runs[runId].stages[0] = { outcome: r.status === 0 ? 'done' : 'blocked', note: r.stdout.trim().split('\n').pop(), at: new Date().toISOString() };
  return r.status === 0;
}

function afterAudit(repo, loop, runId, cfg) {
  const audit = join(runDir(repo, runId), 'audit.md');
  const rows = readRanked(existsSync(audit) ? readFileSync(audit, 'utf8') : '');
  const slice = pickSlice(rows, cfg, (loop.parked || []).map((p) => p.slice), visualOn(repo));
  if (!slice) {
    loop.idle = true;
    loop.runs[runId].finished = 'idle';
    return;
  }
  loop.runs[runId].slice = slice.id;
  confirmSlice(repo, runId, slice);
}

function afterFinalize(repo, loop, runId, cfg) {
  const run = loop.runs[runId];
  const note = run.stages[5]?.note || '';
  run.branch = note.match(/branch=(\S+)/)?.[1] || '';
  const ahead = commitsAhead(repo, run.branch, cfg);
  loop.no_change_runs = ahead ? 0 : (loop.no_change_runs || 0) + 1;
  const check = cycleState(repo, 'check', runId);
  if (check.status !== 0) return park(loop, runId, 'finalize claimed done but completion items lack evidence', cfg);
  if (!ahead) {
    run.finished = 'no change';
    return;
  }
  const result = publish(repo, runId, run.branch, cfg, loop);
  if (result.startsWith('STOP:')) {
    loop.stop = result.slice(5);
    return;
  }
  run.published = result.replace(/^PR:/, 'draft PR ');
  run.finished = 'done';
  if (result.startsWith('PR:')) notify(cfg, 'pr', `${run.slice}: ${result.slice(3)}`);
  if (result.startsWith('PR:') && cfg.merge === 'on') run.review_pending = true;
  notify(cfg, 'run-done', `${runId}: ${run.slice} -> ${run.published}`);
}

// --- review and merge (merge: on) ------------------------------------------------------

const ciPollMs = () => Number(process.env.CYCLE_CI_POLL_MS || 30 * 1000);
const prNumber = (text) => Number(String(text || '').match(/\/pull\/(\d+)/)?.[1]) || null;

/** One state from a PR's statusCheckRollup: 'pass', 'fail' or 'pending'. No checks is a pass; the repo's rules still apply at merge. */
export function ciState(rollup = []) {
  let pending = false;
  for (const c of rollup || []) {
    const state = c.state ?? (c.status && c.status !== 'COMPLETED' ? 'PENDING' : c.conclusion);
    if (['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(state)) return 'fail';
    if (!['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(state)) pending = true;
  }
  return pending ? 'pending' : 'pass';
}

function prView(repo, number, fields) {
  const r = gh(repo, 'pr', 'view', String(number), '--json', fields);
  return r.status === 0 ? JSON.parse(r.stdout) : null;
}

/** The next open PR carrying merge_label that is not the loop's own and was not reviewed at its current head. */
function nextLabeledPr(repo, loop, cfg) {
  const r = gh(repo, 'pr', 'list', '--state', 'open', '--label', cfg.merge_label, '--json', 'number,headRefName,headRefOid');
  if (r.status !== 0) return null;
  const mine = new Set(Object.values(loop.runs || {}).map((run) => run.branch).filter(Boolean));
  return JSON.parse(r.stdout || '[]').find((p) => !mine.has(p.headRefName) && loop.reviews?.[p.number]?.reviewed_sha !== p.headRefOid) ?? null;
}

/**
 * Reviews one PR in a fresh session, posts the review as one comment, and merges it
 * when the gate holds: an approving review, passing checks, the critic's approval
 * (own runs, when merge_needs_critic and a visual contract), no open block card,
 * and no new commits since the review. Own runs whose review asks for changes go
 * back to stage 4; other PRs only get the comment.
 */
async function reviewPr(repo, loop, cfg, save, { number, runId, sha }) {
  const own = runId ? loop.runs[runId] : null;
  const rec = own || ((loop.reviews ??= {})[number] ??= {});
  const finish = (note) => {
    rec.review = note;
    if (own) delete own.review_pending;
  };
  const pr = prView(repo, number, 'number,title,url,state,isDraft,baseRefName,headRefName,headRefOid,labels');
  // Once per head commit, skipped or failed alike, so a PR the loop cannot take is not picked again.
  rec.reviewed_sha = pr?.headRefOid ?? sha;
  if (!pr) return finish(`review skipped: cannot read PR #${number}`);
  if (pr.state !== 'OPEN') return finish(`review skipped: PR #${number} is ${String(pr.state).toLowerCase()}`);
  if (pr.baseRefName !== cfg.base_branch) return finish(`review skipped: PR #${number} targets ${pr.baseRefName}, not ${cfg.base_branch}`);
  const label = runId ? `${runId}/review` : `reviews/pr-${number}`;
  const dir = join(cycleDir(repo), label);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, 'pr.json'), pr);
  for (const f of ['review.json', 'comment.md']) rmSync(join(dir, f), { force: true });
  loop.current_stage = { run: label, stage: 'r', model: cfg.models_review, started: new Date().toISOString() };
  save();
  const result = await runStage(repo, label, 'r', cfg, cfg.models_review, save, `/cycle review ${number} .claude/cycle/${label}`);
  delete loop.current_stage;
  account(loop, rec, result);
  if (AUTH_FAILED.test(result.text)) {
    loop.stop = 'the claude CLI is not logged in: run `claude` once and log in, then start the loop again';
    return;
  }
  const review = readJson(join(dir, 'review.json'), null);
  if (!review || !['approve', 'changes'].includes(review.verdict)) return finish('review failed: the session wrote no valid review.json');
  if (existsSync(join(dir, 'comment.md'))) {
    const c = gh(repo, 'pr', 'comment', String(number), '--body-file', join(dir, 'comment.md'));
    rec.review_comment = c.status === 0 ? 'posted' : `comment failed: ${c.stderr.trim()}`;
  }
  if (review.verdict === 'changes') {
    if (!own) return finish(`changes requested on #${number}; commented, not merged`);
    own.review_rounds = (own.review_rounds || 0) + 1;
    const cap = Number(readFrontmatter(readFileSync(join(runDir(repo, runId), 'contract.md'), 'utf8')).retry_cap || 3);
    delete own.review_pending;
    if (own.review_rounds >= cap) return park(loop, runId, `review still asks for changes after ${own.review_rounds} rounds (PR #${number} stays open)`, cfg);
    // Back to review / fix: stage 4 reads review/review.json, stage 5 pushes to the open PR.
    own.review = `changes requested, round ${own.review_rounds}`;
    delete own.finished;
    delete own.stages[4];
    delete own.stages[5];
    return;
  }
  if (own) {
    if (cfg.merge_needs_critic === 'yes' && visualOn(repo) && !/^(approved|no visible change)/.test(own.visual || '')) return finish('approved; not merged: the visual critic has not approved');
    const blocks = openCards(repo).filter((c) => c.run === runId && c.kind === 'block');
    if (blocks.length) return finish(`approved; not merged: ${blocks.length} open block card(s)`);
  }
  const deadline = Date.now() + cfg.merge_ci_wait_min * 60 * 1000;
  let ci = 'pending';
  while (!existsSync(join(cycleDir(repo), 'STOP'))) {
    ci = ciState(prView(repo, number, 'statusCheckRollup')?.statusCheckRollup);
    if (ci !== 'pending' || Date.now() >= deadline) break;
    await waitOut(repo, ciPollMs(), save);
  }
  if (ci !== 'pass') return finish(`approved; not merged: checks ${ci === 'fail' ? 'failed' : 'still pending'}`);
  const now = prView(repo, number, 'headRefOid,isDraft,state,labels');
  if (!now || now.state !== 'OPEN') return finish(`approved; not merged: PR #${number} is no longer open`);
  if (now.headRefOid !== pr.headRefOid) return finish('approved; not merged: new commits since the review');
  if (!own && !(now.labels || []).some((l) => l.name === cfg.merge_label)) return finish(`approved; not merged: the ${cfg.merge_label} label was removed`);
  if (now.isDraft) gh(repo, 'pr', 'ready', String(number));
  const m = gh(repo, 'pr', 'merge', String(number), `--${cfg.merge_method}`);
  if (m.status !== 0) return finish(`approved; merge failed: ${m.stderr.trim().split('\n').pop()}`);
  rec.merged = `merged #${number} (${cfg.merge_method})`;
  notify(cfg, 'merged', `#${number}: ${pr.title}`);
  return finish(rec.merged);
}

// --- the visual critic (runs between stages 4 and 5 when the repo has a visual contract) ------

const visualOn = (repo) => existsSync(join(repo, '.claude', 'visual', 'contract.json')) && existsSync(VISUAL_SCRIPT);
const visual = (...args) => spawnSync(process.execPath, [VISUAL_SCRIPT, ...args], { encoding: 'utf8' });

/** Adds a session's cost and plan usage to the run and the loop. */
function account(loop, run, result) {
  if (Object.keys(result.usage).length) loop.usage = { ...loop.usage, ...result.usage };
  run.cost = (run.cost || 0) + result.cost;
  loop.total_cost = (loop.total_cost || 0) + result.cost;
  loop.session_cost += result.cost;
}

/**
 * The critic is its own headless session, started here with a brief this script builds from
 * files, so the session that wrote the change cannot steer it. The script records the verdicts.
 */
/** The run branch's worktree, from stage 3's "implemented on <branch>" note; else `<run>/wt` when it exists; else the repo. */
export function runTree(repo, runId, note) {
  const branch = String(note || '').match(/implemented on (\S+)/)?.[1];
  if (branch) {
    const list = git(repo, 'worktree', 'list', '--porcelain').stdout.split(/\r?\n\r?\n/);
    const hit = list.find((block) => block.split(/\r?\n/).includes(`branch refs/heads/${branch}`));
    const path = hit?.match(/^worktree (.+)$/m)?.[1];
    if (path) return resolve(path);
  }
  const wt = join(runDir(repo, runId), 'wt');
  return existsSync(wt) ? wt : repo;
}

/** Runs a command without blocking the loop, beating the heartbeat meanwhile: { status, stdout, stderr }. */
function runAsync(cmd, args, opts, beat) {
  return new Promise((done) => {
    const child = spawn(cmd, args, opts);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    const timer = setInterval(beat, heartbeatMs());
    child.on('close', (status) => {
      clearInterval(timer);
      done({ status, stdout, stderr });
    });
  });
}

/**
 * After stage 4 in a repo with a visual contract, the loop takes the captures itself:
 * every state from a fresh worktree of `origin/<base>` and from the run branch, then
 * the pixels say which states changed. No model decides whether, what or where to capture.
 */
async function captureVisual(repo, loop, runId, cfg, save) {
  const run = loop.runs[runId];
  const dir = runDir(repo, runId);
  const vdir = join(dir, 'visual');
  const base = join(dir, 'visual-base');
  const tree = runTree(repo, runId, run.stages[3]?.note);
  loop.current_stage = { run: runId, stage: '4c', model: '', started: new Date().toISOString() };
  save();
  const removeBase = () => existsSync(base) && cycleState(repo, 'remove-worktree', runId, base);
  const fail = (why) => {
    removeBase();
    delete loop.current_stage;
    delete run.capture_pending;
    park(loop, runId, `visual captures failed: ${why}`, cfg);
  };
  for (const sub of ['before', 'after']) rmSync(join(vdir, sub), { recursive: true, force: true });
  removeBase();
  git(repo, 'fetch', '-q', 'origin');
  const add = git(repo, 'worktree', 'add', '-q', '--detach', base, `origin/${cfg.base_branch}`);
  if (add.status !== 0) return fail(`cannot cut a worktree of origin/${cfg.base_branch}: ${add.stderr.trim()}`);
  const fm = readFrontmatter(readFileSync(join(dir, 'setup.md'), 'utf8'));
  const env = setupEnv(fm);
  const install = fm.commands?.install;
  if (install) {
    const r = await runAsync(install, [], { cwd: base, env, shell: true }, save);
    if (r.status !== 0) return fail(`\`${install}\` failed in the base worktree: ${(r.stderr || r.stdout).trim().split('\n').pop()}`);
  }
  for (const [sub, from] of [['before', base], ['after', tree]]) {
    const r = await runAsync(process.execPath, [VISUAL_SCRIPT, 'capture', repo, '--out', join(vdir, sub), '--tree', from], { env }, save);
    if (r.status !== 0) return fail(`${sub}: ${`${r.stdout}${r.stderr}`.trim().split('\n').filter((l) => l.startsWith('failed')).join('; ')}`);
  }
  removeBase();
  delete loop.current_stage;
  delete run.capture_pending;
  const t = visual('touched', repo, runId, '--tree', tree);
  if (t.status !== 0) return fail(t.stderr.trim());
  const { states } = JSON.parse(t.stdout);
  if (states.length) run.visual_pending = true;
  else run.visual = 'no visible change above the noise floor in any state';
}

async function runCritic(repo, loop, runId, cfg, save) {
  const run = loop.runs[runId];
  const vdir = join(runDir(repo, runId), 'visual');
  const touched = readJson(join(vdir, 'touched.json'), { tree: '.', states: [] });
  const tree = resolve(repo, touched.tree || '.');
  const states = touched.states.join(',');
  // Judge only captures of the current head: retake stale ones here, not in a model session.
  if (visual('fresh', join(vdir, 'after', 'manifest.json'), '--tree', tree).status !== 0) {
    visual('capture', repo, '--out', join(vdir, 'after'), '--tree', tree, '--states', states);
  }
  const input = visual('critic-input', repo, runId, '--touched', states);
  if (input.status !== 0) {
    run.visual_error = input.stderr.trim();
    loop.errors_in_a_row = (loop.errors_in_a_row || 0) + 1;
    return;
  }
  writeFileSync(join(vdir, 'critic-input.json'), input.stdout);
  const verdictsFile = join(vdir, 'verdicts.json');
  rmSync(verdictsFile, { force: true });
  loop.current_stage = { run: runId, stage: '4v', model: cfg.models_critic, started: new Date().toISOString() };
  save();
  const result = await runStage(repo, runId, '4v', cfg, cfg.models_critic, save, `/visual critic ${runId}`);
  const { started } = loop.current_stage;
  delete loop.current_stage;
  account(loop, run, result);
  (run.critic_passes ??= []).push({ model: cfg.models_critic, cost: result.cost, started, at: new Date().toISOString() });
  if (AUTH_FAILED.test(result.text)) {
    loop.stop = 'the claude CLI is not logged in: run `claude` once and log in, then start the loop again';
    return;
  }
  const rec = visual('record', repo, runId, verdictsFile, '--tree', tree);
  if (rec.status !== 0) {
    run.visual_error = `${rec.stdout}${rec.stderr}`.trim();
    loop.errors_in_a_row = (loop.errors_in_a_row || 0) + 1;
    return;
  }
  loop.errors_in_a_row = 0;
  delete run.visual_error;
  delete run.visual_pending;
  const verdicts = readJson(verdictsFile, []);
  const revise = verdicts.filter((v) => v.verdict === 'needs-revision');
  if (!revise.length) {
    run.visual = `approved (${verdicts.length} decision(s))`;
    return;
  }
  run.visual_rounds = (run.visual_rounds || 0) + 1;
  const cap = Number(readFrontmatter(readFileSync(join(runDir(repo, runId), 'contract.md'), 'utf8')).retry_cap || 3);
  if (run.visual_rounds >= cap) {
    park(loop, runId, `visual critic still asks for revision after ${run.visual_rounds} rounds: ${revise.map((v) => v.state).join(', ')}`, cfg);
    return;
  }
  // Back to review / fix: stage 4 reads visual/verdicts.json as findings.
  run.visual = `needs revision: ${revise.map((v) => v.state).join(', ')}`;
  delete run.stages[4];
}

/** Runs the loop until a stop condition. Resolves with the stop reason. */
export async function runLoop(repo) {
  mkdirSync(cycleDir(repo), { recursive: true });
  const loop = readJson(loopFile(repo), {});
  // A start begins a new loop session: limits count from here, history stays.
  Object.assign(loop, { started: new Date().toISOString(), session_cost: 0, no_change_runs: 0, errors_in_a_row: 0, idle: false });
  loop.runs ??= {};
  loop.git_fingerprint = gitFingerprint(repo, readConfig(repo).run_branch_prefix);
  delete loop.stop;
  delete loop.waiting;
  delete loop.current_stage;
  let cardsSeen = openCards(repo).length;
  const cfg0 = readConfig(repo);
  const server = cfg0.port ? startStatusServer(repo, cfg0.port) : null;
  try {
    for (;;) {
      const cfg = readConfig(repo);
      const reason = loop.stop || stopReason(repo, loop, cfg);
      if (reason) {
        loop.stop = reason;
        save(repo, loop);
        notify(cfg, 'stopped', reason);
        return reason;
      }
      const wait = usageWait(loop, cfg);
      if (wait) {
        loop.waiting = `5-hour usage at ${pct(loop.usage.five_hour.utilization)} (cap ${cfg.max_usage_5h}%), waiting for the reset at ${new Date(loop.usage.five_hour.resets_at).toISOString()}`;
        save(repo, loop);
        await waitOut(repo, wait, () => save(repo, loop));
        delete loop.waiting;
        delete loop.usage.five_hour;
        continue;
      }
      // A published run's review and merge come before the next run.
      const toReview = Object.entries(loop.runs).find(([, r]) => r.review_pending);
      if (toReview) {
        const [id, r] = toReview;
        if (cfg.merge === 'on' && prNumber(r.published)) await reviewPr(repo, loop, cfg, () => save(repo, loop), { number: prNumber(r.published), runId: id });
        else delete r.review_pending;
        save(repo, loop);
        continue;
      }
      // Between runs, one PR you labeled for the loop.
      if (cfg.merge === 'on' && (!loop.current_run || loop.runs[loop.current_run]?.finished)) {
        const labeled = nextLabeledPr(repo, loop, cfg);
        if (labeled) {
          await reviewPr(repo, loop, cfg, () => save(repo, loop), { number: labeled.number, sha: labeled.headRefOid });
          save(repo, loop);
          continue;
        }
      }
      let runId = loop.current_run;
      if (!runId || loop.runs[runId]?.finished) runId = newRun(repo, loop);
      const run = loop.runs[runId];
      // A run resumed after a restart finishes in this start, so it counts toward this start's max_runs.
      run.session = loop.started;
      if (run.capture_pending) {
        await captureVisual(repo, loop, runId, cfg, () => save(repo, loop));
        save(repo, loop);
        continue;
      }
      if (run.visual_pending) {
        await runCritic(repo, loop, runId, cfg, () => save(repo, loop));
        save(repo, loop);
        continue;
      }
      const stage = nextStage(run);
      // Finalize is done but publishing stopped (a .git change, say): publish again, no stage to run.
      if (stage > 5) {
        afterFinalize(repo, loop, runId, cfg);
        save(repo, loop);
        continue;
      }
      if (stage === 0) {
        if (!stageZero(repo, loop, runId)) {
          loop.stop = 'setup gaps: answer the block cards, then start the loop again';
          continue;
        }
        save(repo, loop);
        continue;
      }
      // A rerun must not read the outcome an earlier pass of this stage left behind.
      const outcomeFile = join(runDir(repo, runId), `outcome-${stage}.json`);
      rmSync(outcomeFile, { force: true });
      const audit = join(runDir(repo, runId), 'audit.md');
      const model = stageModel(cfg, stage, existsSync(audit) ? confirmedEffort(readFileSync(audit, 'utf8')) : '');
      loop.current_stage = { run: runId, stage, model, started: new Date().toISOString() };
      save(repo, loop);
      const result = await runStage(repo, runId, stage, cfg, model, () => save(repo, loop));
      unlinkOutsideLinks(repo, runId);
      const { started } = loop.current_stage;
      delete loop.current_stage;
      account(loop, run, result);
      if (AUTH_FAILED.test(result.text)) {
        loop.stop = 'the claude CLI is not logged in: run `claude` once and log in, then start the loop again';
        continue;
      }
      if (USAGE_LIMIT.test(result.text)) {
        save(repo, loop);
        await sleep(Number(process.env.CYCLE_LIMIT_WAIT_MS || DEFAULT_LIMIT_WAIT_MS));
        continue;
      }
      const written = readJson(outcomeFile, null);
      const outcome = written && !result.isError ? written : { outcome: 'error', note: result.text.slice(0, 200), at: new Date().toISOString() };
      run.stages[stage] = { ...outcome, model, cost: result.cost, started };
      loop.errors_in_a_row = outcome.outcome === 'error' ? (loop.errors_in_a_row || 0) + 1 : 0;
      if (outcome.outcome === 'error') {
        delete run.stages[stage];
        run.last_error = outcome.note;
      } else if (['blocked', 'stuck', 'budget'].includes(outcome.outcome)) {
        park(loop, runId, outcome.note || outcome.outcome, cfg);
      } else if (outcome.outcome === 'idle') {
        loop.idle = true;
        run.finished = 'idle';
      } else if (stage === 1) {
        afterAudit(repo, loop, runId, cfg);
      } else if (stage === 2) {
        resolveCard(repo, runId, 'slice-pick.md');
      } else if (stage === 4 && visualOn(repo)) {
        run.capture_pending = true;
      } else if (stage === 5) {
        afterFinalize(repo, loop, runId, cfg);
      }
      const cardsNow = openCards(repo).length;
      if (cardsNow > cardsSeen) notify(cfg, 'card', `${cardsNow - cardsSeen} new card(s) in ${runId}`);
      cardsSeen = cardsNow;
      save(repo, loop);
    }
  } finally {
    server?.close();
  }
}

// --- the other commands ------------------------------------------------------------------

function status(repo) {
  const digest = join(cycleDir(repo), 'digest.md');
  console.log(existsSync(digest) ? readFileSync(digest, 'utf8').split('\n').slice(0, 20).join('\n') : 'no loop has run here');
}

async function watch(repo) {
  let shown = '';
  for (;;) {
    const feed = currentFeed(repo, readJson(loopFile(repo), {}));
    if (feed !== shown) {
      process.stdout.write(feed.startsWith(shown) ? feed.slice(shown.length) : `\n${feed}`);
      shown = feed;
    }
    await sleep(1000);
  }
}

function stop(repo) {
  mkdirSync(cycleDir(repo), { recursive: true });
  writeFileSync(join(cycleDir(repo), 'STOP'), `${new Date().toISOString()}\n`);
  console.log('STOP written; the loop stops after the current stage');
}

async function main([cmd = 'run', repoArg]) {
  const repo = resolve(repoArg || process.cwd());
  if (cmd === 'run') console.log(`loop stopped: ${await runLoop(repo)}`);
  else if (cmd === 'status') status(repo);
  else if (cmd === 'watch') await watch(repo);
  else if (cmd === 'stop') stop(repo);
  else {
    console.error('usage: cycle-loop.mjs <run|status|watch|stop> [repo]');
    process.exit(2);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
