// Tests for cycle-loop.mjs with a stub claude and gh. Run: node --test skills/cycle/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import {
  runLoop, readRanked, readConfig, pickSlice, feedLine, stopReason, notify, startStatusServer, renderDigest, visualFilePath, statusJson, prsJson, readUsage, usageWait, stageModel, confirmedEffort, configWithoutRunBranches, isRunBranch, unlinkOutsideLinks, ciState,
} from '../cycle-loop.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB = join(HERE, 'fixtures', 'stub-claude.mjs').replace(/\\/g, '/');
const STUB_GH = join(HERE, 'fixtures', 'stub-gh.mjs').replace(/\\/g, '/');

Object.assign(process.env, {
  CYCLE_CLAUDE: `node ${STUB}`,
  CYCLE_GH: `node ${STUB_GH}`,
  CYCLE_STATE: join(HERE, '..', 'cycle-state.mjs'),
  CYCLE_LIMIT_WAIT_MS: '10',
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', // share-readiness: WONT_FIX — fake identity for fixture commits
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com', // share-readiness: WONT_FIX — fake identity for fixture commits
});

/** A repo with a bare origin, a config.md and a setup.md template. */
function fixtureRepo(config = {}) {
  const base = mkdtempSync(join(tmpdir(), 'cycle-loop-'));
  const repo = join(base, 'repo');
  const origin = join(base, 'origin.git');
  const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' });
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  spawnSync('git', ['init', '-q', '-b', 'main', repo]);
  writeFileSync(join(repo, 'README.md'), 'fixture\n');
  git(repo, 'add', 'README.md');
  git(repo, 'commit', '-q', '-m', 'init');
  git(repo, 'remote', 'add', 'origin', origin);
  git(repo, 'push', '-q', '-u', 'origin', 'main');
  const cycle = join(repo, '.claude', 'cycle');
  mkdirSync(cycle, { recursive: true });
  const cfg = { max_runs: 2, max_hours: 5, stage_budget_usd: 1, total_budget_usd: 40, github: 'push+draft-pr', base_branch: 'main', never_touch: '.github/**', port: 0, ...config };
  writeFileSync(join(cycle, 'config.md'), `---\n${Object.entries(cfg).map(([k, v]) => `${k}: ${v}`).join('\n')}\nnotify:\n  channels: toast, webhook:http://127.0.0.1:9/hook\n  events: parked, pr, stopped, card\n---\n`);
  writeFileSync(join(cycle, 'setup.md'), '---\ncommands:\n  smoke: node -v\nwrite_scope:\n  base_branch: main\n  run_branch: after-slice\n---\n# Setup\n');
  process.env.CYCLE_NOTIFY_LOG = join(base, 'notify.log');
  return repo;
}

const loopJson = (repo) => JSON.parse(readFileSync(join(repo, '.claude', 'cycle', 'loop.json'), 'utf8'));
const notes = () => (existsSync(process.env.CYCLE_NOTIFY_LOG) ? readFileSync(process.env.CYCLE_NOTIFY_LOG, 'utf8') : '');

test('two runs end to end, then it stops at the run count', async () => {
  process.env.STUB_MODE = 'ok';
  const repo = fixtureRepo();
  const reason = await runLoop(repo);
  assert.equal(reason, '2 runs finished');
  const loop = loopJson(repo);
  const runs = Object.values(loop.runs);
  assert.equal(runs.length, 2);
  for (const r of runs) {
    assert.deepEqual(Object.keys(r.stages), ['0', '1', '2', '3', '4', '5']);
    assert.match(r.published, /^draft PR https:/);
  }
  assert.deepEqual(runs.map((r) => r.slice), ['A1', 'A1'], 'each run audits again and picks the top slice');
  const digest = readFileSync(join(repo, '.claude', 'cycle', 'digest.md'), 'utf8');
  assert.match(digest, /stopped: 2 runs finished/);
  for (const id of Object.keys(loop.runs)) assert.match(digest, new RegExp(`## ${id}`));
  const ls = spawnSync('git', ['-C', repo, 'ls-remote', '--heads', 'origin'], { encoding: 'utf8' }).stdout;
  assert.match(ls, /refs\/heads\/feat\/a1-/, 'a Missing slice gets a feat/ branch');
  const gh = readFileSync(join(repo, '.claude', 'cycle', 'gh-calls.log'), 'utf8');
  assert.match(gh, /pr create --draft --base main --head feat\/a1-/);
  assert.match(notes(), /^toast\tcycle pr: A1:/m);
  assert.match(notes(), /^webhook:http:\/\/127\.0\.0\.1:9\/hook\tcycle stopped: 2 runs finished/m);
  assert.match(readFileSync(join(repo, '.claude', 'cycle', Object.keys(loop.runs)[0], 'stage-3.log'), 'utf8'), /> Bash: stage 3 work/);
  const models = readFileSync(join(repo, '.claude', 'cycle', 'stub-calls.log'), 'utf8').trim().split('\n').slice(0, 5).map((l) => l.split(' ').slice(1).join(' '));
  assert.deepEqual(models, ['1 opus', '2 sonnet', '3 sonnet', '4 sonnet', '5 sonnet'], 'audit on opus, S slice on sonnet by default');
  assert.equal(runs[0].stages[2].model, 'sonnet');
  assert.equal(runs[0].stages[2].cost, 0.25);
});

test('stageModel: fixed models, auto by effort, and empty for the CLI default', () => {
  const cfg = { models_audit: 'opus', models_work: 'auto', models_S: 'haiku', models_M: 'sonnet', models_L: '' };
  assert.equal(stageModel(cfg, 1, 'S'), 'opus');
  assert.equal(stageModel(cfg, 3, 's'), 'haiku');
  assert.equal(stageModel(cfg, 3, 'M'), 'sonnet');
  assert.equal(stageModel(cfg, 3, 'L'), '', 'no model set: the CLI default');
  assert.equal(stageModel({ ...cfg, models_work: 'opus' }, 4, 'S'), 'opus');
});

test('confirmedEffort follows a slice the user swapped in', () => {
  const audit = '## Ranked\n\n| id | gap | kind | effort |\n|---|---|---|---|\n| A1 | x | Missing | S |\n| A2 | y | Polish | M |\n\n## Confirmed slice\n\nA2\n';
  assert.equal(confirmedEffort(audit), 'M');
  assert.equal(confirmedEffort(audit.replace('A2\n', 'A1: x (effort S, files a.ts)\n')), 'S');
  assert.equal(confirmedEffort('## Ranked\n'), '');
});

test('models in config.md override the defaults', () => {
  const repo = mkdtempSync(join(tmpdir(), 'cfg-'));
  mkdirSync(join(repo, '.claude', 'cycle'), { recursive: true });
  writeFileSync(join(repo, '.claude', 'cycle', 'config.md'), '---\nmodels:\n  audit: sonnet\n  M: opus\n---\n');
  const cfg = readConfig(repo);
  assert.equal(cfg.models_audit, 'sonnet');
  assert.equal(cfg.models_M, 'opus');
  assert.equal(cfg.models_S, 'sonnet');
  assert.equal(cfg.models_work, 'auto');
});

test('a block parks the slice and the next run takes the next one', async () => {
  process.env.STUB_MODE = 'block-first';
  const repo = fixtureRepo();
  await runLoop(repo);
  const loop = loopJson(repo);
  const runs = Object.values(loop.runs);
  assert.equal(runs[0].finished, 'parked');
  assert.equal(runs[1].slice, 'A2', 'A1 is parked, A3 is a taste-call, so A2');
  assert.deepEqual(loop.parked.map((p) => p.slice), ['A1']);
  assert.match(notes(), /cycle parked: A1: architecture fork/);
  assert.match(readFileSync(join(repo, '.claude', 'cycle', 'digest.md'), 'utf8'), /parked slice A1/);
});

test('stops on the STOP file before any stage', async () => {
  process.env.STUB_MODE = 'ok';
  const repo = fixtureRepo();
  writeFileSync(join(repo, '.claude', 'cycle', 'STOP'), '');
  assert.equal(await runLoop(repo), 'STOP file');
  assert.ok(!existsSync(join(repo, '.claude', 'cycle', 'stub-calls.log')));
});

test('stops on the budget', async () => {
  process.env.STUB_MODE = 'ok';
  const repo = fixtureRepo({ total_budget_usd: 0.5 });
  assert.equal(await runLoop(repo), 'total budget $0.5 reached');
  assert.equal(readFileSync(join(repo, '.claude', 'cycle', 'stub-calls.log'), 'utf8').trim().split('\n').length, 2);
});

test('stops after two runs that change nothing', async () => {
  process.env.STUB_MODE = 'nochange';
  const repo = fixtureRepo({ max_runs: 5 });
  assert.equal(await runLoop(repo), 'two runs in a row changed no files');
  assert.ok(!existsSync(join(repo, '.claude', 'cycle', 'gh-calls.log')), 'nothing to push, no PR');
});

test('stops after two stage errors in a row', async () => {
  process.env.STUB_MODE = 'error';
  const repo = fixtureRepo();
  assert.equal(await runLoop(repo), 'a stage errored twice in a row');
});

test('goes idle when the audit has nothing within the limits', async () => {
  process.env.STUB_MODE = 'idle';
  const repo = fixtureRepo();
  assert.equal(await runLoop(repo), 'the audit found nothing the loop may take on its own');
});

test('waits out a usage limit instead of counting an error', async () => {
  process.env.STUB_MODE = 'limit';
  const repo = fixtureRepo({ max_runs: 1 });
  assert.equal(await runLoop(repo), '1 runs finished');
  assert.equal(loopJson(repo).errors_in_a_row, 0);
});

test('a heartbeat after the outcome does not erase it', async () => {
  process.env.STUB_MODE = 'late';
  process.env.CYCLE_HEARTBEAT_MS = '20';
  try {
    const repo = fixtureRepo({ max_runs: 1 });
    assert.equal(await runLoop(repo), '1 runs finished');
    assert.equal(loopJson(repo).errors_in_a_row, 0);
  } finally {
    delete process.env.CYCLE_HEARTBEAT_MS;
  }
});

test('stops when weekly plan usage reaches its cap', async () => {
  process.env.STUB_MODE = 'week';
  const repo = fixtureRepo({ max_usage_7d: 50 });
  assert.equal(await runLoop(repo), 'weekly usage at 90% reached the 50% cap');
  assert.equal(readFileSync(join(repo, '.claude', 'cycle', 'stub-calls.log'), 'utf8').trim().split('\n').length, 1, 'no stage after the cap');
  assert.match(readFileSync(join(repo, '.claude', 'cycle', 'digest.md'), 'utf8'), /5h 10% · 7d 90%/);
});

test('waits for the 5-hour reset at the cap, then goes on', async () => {
  process.env.STUB_MODE = 'fivehour';
  const repo = fixtureRepo({ max_runs: 1, max_usage_5h: 70 });
  assert.equal(await runLoop(repo), '1 runs finished');
  assert.equal(loopJson(repo).waiting, undefined);
});

test('readUsage and usageWait read the rate-limit report', () => {
  const usage = readUsage({ type: 'rate_limit_event', rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.8, resetsAt: 100 } } } });
  assert.deepEqual(usage, { five_hour: { utilization: 0.8, resets_at: 100000 } });
  assert.equal(usageWait({ usage }, { max_usage_5h: 70 }, 40000), 60000);
  assert.equal(usageWait({ usage }, { max_usage_5h: 90 }, 40000), 0, 'under the cap');
  assert.equal(usageWait({ usage }, { max_usage_5h: 0 }, 40000), 0, 'cap off');
  assert.equal(usageWait({ usage }, { max_usage_5h: 70 }, 200000), 0, 'window already reset');
});

test('a weekly cap on stale usage does not stop the loop', () => {
  const loop = { started: new Date().toISOString(), runs: {}, usage: { seven_day: { utilization: 0.9, resets_at: Date.now() - 1000 } } };
  assert.equal(stopReason(mkdtempSync(join(tmpdir(), 'x-')), loop, { total_budget_usd: 9, max_hours: 2, max_runs: 5, max_usage_7d: 50 }), null);
});

test('stops at once when the claude CLI is not logged in', async () => {
  process.env.STUB_MODE = 'auth';
  const repo = fixtureRepo();
  assert.match(await runLoop(repo), /claude CLI is not logged in/);
  assert.equal(readFileSync(join(repo, '.claude', 'cycle', 'stub-calls.log'), 'utf8').trim().split('\n').length, 1, 'one call, no retry');
});

test('github none keeps the branch local', async () => {
  process.env.STUB_MODE = 'ok';
  const repo = fixtureRepo({ max_runs: 1, github: 'none' });
  await runLoop(repo);
  assert.match(Object.values(loopJson(repo).runs)[0].published, /kept local/);
  assert.doesNotMatch(spawnSync('git', ['-C', repo, 'ls-remote', '--heads', 'origin'], { encoding: 'utf8' }).stdout, /feat\/|fix\//);
});

test('run branches follow run_branch_prefix; open PRs count only the loop\'s own branches', async () => {
  assert.equal(isRunBranch({ run_branch_prefix: 'feat/, fix/' }, 'fix/help-keys'), true);
  assert.equal(isRunBranch({ run_branch_prefix: 'feat/, fix/' }, 'cycle/a1-r1'), false);
  assert.equal(isRunBranch({ run_branch_prefix: 'feat/, fix/' }, 'main'), false);
  process.env.STUB_MODE = 'ok';
  process.env.STUB_OPEN_PRS = JSON.stringify([{ headRefName: 'feat/someone-elses-work' }, { headRefName: 'fix/another' }]);
  try {
    const repo = fixtureRepo({ max_runs: 1, max_open_prs: 1 });
    assert.equal(await runLoop(repo), '1 runs finished');
    assert.match(Object.values(loopJson(repo).runs)[0].published, /^draft PR https:/, 'the user\'s own feat/ and fix/ PRs do not fill max_open_prs');
  } finally {
    delete process.env.STUB_OPEN_PRS;
  }
});

test('a changed .git/config stops the loop before it pushes', async () => {
  process.env.STUB_MODE = 'ok';
  const repo = fixtureRepo({ max_runs: 1 });
  const stub = process.env.CYCLE_CLAUDE;
  process.env.CYCLE_CLAUDE = `node ${join(HERE, 'fixtures', 'stub-tamper.mjs').replace(/\\/g, '/')}`;
  try {
    assert.equal(await runLoop(repo), '.git/config or .git/hooks changed since the loop started');
  } finally {
    process.env.CYCLE_CLAUDE = stub;
  }
});

test('tracking on the loop\'s own run branch is not tampering', async () => {
  process.env.STUB_MODE = 'track';
  const repo = fixtureRepo({ max_runs: 1 });
  assert.equal(await runLoop(repo), '1 runs finished');
  assert.match(Object.values(loopJson(repo).runs)[0].published, /^draft PR https:/);
});

test('after a stage, a link out of the run folder is unlinked, its target kept, and a card left', () => {
  const repo = mkdtempSync(join(tmpdir(), 'links-'));
  const run = join(repo, '.claude', 'cycle', 'r1');
  mkdirSync(join(run, 'wt'), { recursive: true });
  mkdirSync(join(repo, 'node_modules'));
  writeFileSync(join(repo, 'node_modules', 'keep.txt'), 'kept\n');
  writeFileSync(join(run, 'log.md'), '# Log\n');
  symlinkSync(join(repo, 'node_modules'), join(run, 'wt', 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(unlinkOutsideLinks(repo, 'r1').length, 1);
  assert.ok(!existsSync(join(run, 'wt', 'node_modules')), 'link gone');
  assert.equal(readFileSync(join(repo, 'node_modules', 'keep.txt'), 'utf8'), 'kept\n');
  assert.equal(readdirSync(join(run, 'cards')).filter((f) => f.startsWith('outside-links-')).length, 1);
  assert.match(readFileSync(join(run, 'log.md'), 'utf8'), /unlinked 1 link/);
  assert.deepEqual(unlinkOutsideLinks(repo, 'r1'), [], 'nothing left on a second pass');
});

test('configWithoutRunBranches drops only the run-branch sections', () => {
  const config = '[core]\n\tbare = false\n[branch "cycle/a1-r1"]\n\tremote = origin\n\tmerge = refs/heads/main\n[branch "main"]\n\tremote = origin\n[core]\n\tfsmonitor = evil\n';
  const kept = configWithoutRunBranches(config, 'cycle/');
  assert.doesNotMatch(kept, /cycle\/a1/);
  assert.match(kept, /\[branch "main"\]/);
  assert.match(kept, /fsmonitor = evil/, 'a section after a run branch is still checked');
  assert.equal(configWithoutRunBranches(config, ''), config, 'no prefix: nothing dropped');
  assert.equal(configWithoutRunBranches(`${config}[branch "cycle/b"]\n\tremote = origin\n`, 'cycle/'), kept, 'an appended run-branch section changes nothing');
  const two = configWithoutRunBranches(`${config}[branch "fix/x"]\n\tremote = origin\n[branch "feat/y"]\n\tremote = origin\n`, 'feat/, fix/');
  assert.doesNotMatch(two, /fix\/x|feat\/y/, 'a comma list drops every listed prefix');
});

test('a restart after a stop at publish publishes without running a stage', async () => {
  process.env.STUB_MODE = 'ok';
  const repo = fixtureRepo({ max_runs: 1 });
  const stub = process.env.CYCLE_CLAUDE;
  process.env.CYCLE_CLAUDE = `node ${join(HERE, 'fixtures', 'stub-tamper.mjs').replace(/\\/g, '/')}`;
  try {
    assert.equal(await runLoop(repo), '.git/config or .git/hooks changed since the loop started');
  } finally {
    process.env.CYCLE_CLAUDE = stub;
  }
  const config = join(repo, '.git', 'config');
  writeFileSync(config, readFileSync(config, 'utf8').replace('[core]\n\tfsmonitor = evil\n', ''));
  const calls = join(repo, '.claude', 'cycle', 'stub-calls.log');
  const before = readFileSync(calls, 'utf8');
  assert.equal(await runLoop(repo), '1 runs finished');
  assert.equal(readFileSync(calls, 'utf8'), before, 'no stage ran on the restart');
  assert.match(Object.values(loopJson(repo).runs)[0].published, /^draft PR https:/);
});

test('pickSlice skips taste-calls, parked, over-effort and never_touch', () => {
  const rows = readRanked('## Ranked\n\n| id | gap | kind | effort | files | taste | status |\n|---|---|---|---|---|---|---|\n| A | x | Missing | L | a.ts | no | open |\n| B | x | Polish | S | b.ts | yes | open |\n| C | x | Polish | S | .github/ci.yml | no | open |\n| D | x | Polish | M | d.ts | no | parked |\n| E | x | Missing | M | e.ts | no | open |\n| F | x | Missing | S | f.ts | no | open |\n');
  const cfg = { slice_effort: 'S,M', never_touch: '.github/**' };
  assert.equal(pickSlice(rows, cfg).id, 'E');
  assert.equal(pickSlice(rows, cfg, ['E']).id, 'F');
});

test('a taste: visual row is pickable only with a visual contract; taste: yes never is', () => {
  const rows = readRanked('## Ranked\n\n| id | gap | kind | effort | files | taste | status |\n|---|---|---|---|---|---|---|\n| V | card header layout | Polish | S | ui/card.cs | visual | open |\n| Y | balance the prices | Missing | S | core/prices.cs | yes | open |\n| N | plain fix | Missing | S | core/a.cs | no | open |\n');
  const cfg = { slice_effort: 'S,M', never_touch: '' };
  assert.equal(pickSlice(rows, cfg, [], true).id, 'V', 'with a contract the critic takes the look');
  assert.equal(pickSlice(rows, cfg, [], false).id, 'N', 'without one the look waits for the user');
  assert.equal(pickSlice(rows.filter((r) => r.id !== 'N'), cfg, [], true).id, 'V');
  assert.equal(pickSlice(rows.filter((r) => r.id === 'Y'), cfg, [], true), null, 'taste: yes is never picked');
});

test('feedLine renders tool calls, text and the result', () => {
  assert.equal(feedLine({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/a.ts' } }] } }), '> Edit: src/a.ts');
  assert.equal(feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: 'Looking at the audit\nmore' }] } }), '  Looking at the audit');
  assert.equal(feedLine({ type: 'result', is_error: false, result: 'done' }), '= result: done');
  assert.equal(feedLine({ type: 'system' }), null);
});

test('stopReason checks hours from the session start', () => {
  const loop = { started: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), runs: {} };
  assert.equal(stopReason(mkdtempSync(join(tmpdir(), 'x-')), loop, { total_budget_usd: 9, max_hours: 2, max_runs: 5 }), '2 hours passed');
});

test('notify sends only chosen events on every chosen channel', () => {
  process.env.CYCLE_NOTIFY_LOG = join(mkdtempSync(join(tmpdir(), 'n-')), 'n.log');
  const cfg = { notify_channels: 'toast, ntfy:https://ntfy.sh/topic', notify_events: 'stopped' };
  notify(cfg, 'parked', 'x');
  notify(cfg, 'stopped', 'budget');
  assert.equal(notes(), 'toast\tcycle stopped: budget\nntfy:https://ntfy.sh/topic\tcycle stopped: budget\n');
});

test('the status server serves the page and status.json on localhost', async () => {
  process.env.STUB_MODE = 'ok';
  const repo = fixtureRepo({ max_runs: 1 });
  await runLoop(repo);
  const server = startStatusServer(repo, 0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  const get = (path) => new Promise((done) => request({ host: '127.0.0.1', port, path }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => done({ status: res.statusCode, type: res.headers['content-type'], body }));
  }).end());
  const json = await get('/status.json');
  assert.equal(json.status, 200);
  const data = JSON.parse(json.body);
  assert.equal(Object.keys(data.loop.runs).length, 1);
  assert.match(data.feed, /stage 5/);
  const page = await get('/');
  assert.match(page.type, /text\/html/);
  assert.match(page.body, /Cycle status/);
  server.close();
});

test('the shipped config defaults parse to usable values', () => {
  const repo = mkdtempSync(join(tmpdir(), 'cfg-'));
  mkdirSync(join(repo, '.claude', 'cycle'), { recursive: true });
  writeFileSync(join(repo, '.claude', 'cycle', 'config.md'), readFileSync(join(HERE, '..', 'config-defaults.md'), 'utf8'));
  const cfg = readConfig(repo);
  assert.equal(cfg.never_touch, '');
  assert.equal(cfg.github, 'none');
  assert.equal(cfg.max_runs, 5);
  assert.equal(cfg.max_usage_5h, 70);
  assert.equal(cfg.max_usage_7d, 50);
  assert.equal(cfg.notify_channels, 'toast');
  assert.equal(cfg.notify_events, 'parked, pr, stopped');
  assert.equal(pickSlice([{ id: 'A', effort: 'S', files: 'a.ts' }], cfg).id, 'A');
});

test('renderDigest puts block cards and parked slices first', () => {
  const text = renderDigest({ stop: 'STOP file', runs: { r1: { slice: 'A1', stages: { 0: { outcome: 'done' } } } }, parked: [{ slice: 'A2', reason: 'fork' }] }, [{ run: 'r1', card: 'x.md', kind: 'block' }]);
  assert.match(text, /\*\*stopped: STOP file\*\*/);
  assert.match(text, /## Look at this first\n\n- block card `r1\/cards\/x.md`\n- parked slice A2: fork/);
});

// --- the visual critic between stages 4 and 5 -------------------------------------------

const VISUAL = join(HERE, '..', '..', 'visual', 'visual.mjs');
const DRAW = join(HERE, '..', '..', 'visual', 'test', 'fixtures', 'draw.mjs').replace(/\\/g, '/');
const DRAW_TREE = join(HERE, 'fixtures', 'draw-tree.mjs').replace(/\\/g, '/');
process.env.VISUAL_SCRIPT = VISUAL;
process.env.PNGJS_PATH = createRequire(VISUAL).resolve('pngjs');

/** Adds a visual contract with two states; `editor` shows the run branch's change, `present` never changes. */
function withVisual(repo) {
  mkdirSync(join(repo, 'design'), { recursive: true });
  writeFileSync(join(repo, 'design', 'tokens.json'), JSON.stringify({ color: { bg: '#110e18', accent: '#c9a04e' } }));
  mkdirSync(join(repo, '.claude', 'visual'), { recursive: true });
  writeFileSync(join(repo, '.claude', 'visual', 'contract.json'), JSON.stringify({
    tokens: { source: 'design/tokens.json' },
    states: [
      { id: 'editor', shows: 'editor', command: `node ${DRAW_TREE} out/editor.png #110e18`, output: 'out/editor.png' },
      { id: 'present', shows: 'present mode', command: `node ${DRAW} out/present.png #110e18`, output: 'out/present.png' },
    ],
  }));
  return repo;
}

const stubCalls = (repo) => readFileSync(join(repo, '.claude', 'cycle', 'stub-calls.log'), 'utf8').trim().split('\n');
const decisions = (repo) => readFileSync(join(repo, '.claude', 'visual', 'decisions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('the critic runs as its own session after stage 4 and its approval moves the baseline', async () => {
  process.env.STUB_MODE = 'ok';
  process.env.STUB_VISUAL = 'ok';
  try {
    const repo = withVisual(fixtureRepo({ max_runs: 1 }));
    assert.equal(await runLoop(repo), '1 runs finished');
    const run = Object.values(loopJson(repo).runs)[0];
    assert.match(run.visual, /^approved \(2 decision/);
    assert.match(run.published, /^draft PR/);
    const d = decisions(repo);
    assert.deepEqual(d.map((x) => x.state), ['editor', 'present'], 'touched state plus one sibling');
    assert.ok(existsSync(join(repo, '.claude', 'visual', 'baseline', 'editor.png')));
    assert.ok(!existsSync(join(repo, '.claude', 'visual', 'baseline', 'present.png')), 'an untouched sibling is judged, not re-baselined');
    const runId = Object.keys(loopJson(repo).runs)[0];
    assert.ok(existsSync(join(repo, '.claude', 'cycle', runId, 'stage-4v.log')));
    assert.ok(stubCalls(repo).some((l) => l.startsWith('critic ') || l.includes('opus')), 'critic ran with its own model');
    const input = JSON.parse(readFileSync(join(repo, '.claude', 'cycle', runId, 'visual', 'critic-input.json'), 'utf8'));
    assert.equal(input.states[0].id, 'editor');
  } finally {
    delete process.env.STUB_VISUAL;
  }
});

test('a needs-revision verdict sends the run back to stage 4, then it continues', async () => {
  process.env.STUB_MODE = 'ok';
  process.env.STUB_VISUAL = 'revise-once';
  try {
    const repo = withVisual(fixtureRepo({ max_runs: 1 }));
    assert.equal(await runLoop(repo), '1 runs finished');
    const run = Object.values(loopJson(repo).runs)[0];
    assert.equal(run.visual_rounds, 1);
    assert.match(run.visual, /^approved/);
    assert.equal(stubCalls(repo).filter((l) => / 4 /.test(l)).length, 2, 'stage 4 ran twice');
    const d = decisions(repo);
    assert.equal(d[0].verdict, 'needs-revision');
    assert.equal(d.at(-1).verdict, 'consistent');
  } finally {
    delete process.env.STUB_VISUAL;
  }
});

test('the loop, not stage 4, picks the touched states from the before/after pixels', async () => {
  process.env.STUB_MODE = 'ok';
  process.env.STUB_VISUAL = 'ok';
  try {
    const repo = withVisual(fixtureRepo({ max_runs: 1 }));
    await runLoop(repo);
    const runId = Object.keys(loopJson(repo).runs)[0];
    const touched = JSON.parse(readFileSync(join(repo, '.claude', 'cycle', runId, 'visual', 'touched.json'), 'utf8'));
    assert.deepEqual(touched.states, ['editor'], 'only the state whose pixels changed');
    assert.equal(touched.diffs.present.touched, false);
  } finally {
    delete process.env.STUB_VISUAL;
  }
});

test('a change with no visible effect in any state skips the critic', async () => {
  process.env.STUB_MODE = 'ok';
  process.env.STUB_VISUAL = 'same';
  try {
    const repo = withVisual(fixtureRepo({ max_runs: 1 }));
    assert.equal(await runLoop(repo), '1 runs finished');
    const run = Object.values(loopJson(repo).runs)[0];
    assert.match(run.visual, /no visible change/);
    assert.ok(!stubCalls(repo).some((l) => l.includes(' 4v ')), 'no critic session');
    assert.match(run.published, /^draft PR/);
  } finally {
    delete process.env.STUB_VISUAL;
  }
});

test('the loop captures from a base worktree and the run branch, then removes the base worktree', async () => {
  process.env.STUB_MODE = 'ok';
  process.env.STUB_VISUAL = 'ok';
  try {
    const repo = withVisual(fixtureRepo({ max_runs: 1 }));
    await runLoop(repo);
    const runId = Object.keys(loopJson(repo).runs)[0];
    const vdir = join(repo, '.claude', 'cycle', runId, 'visual');
    for (const sub of ['before', 'after']) for (const s of ['editor', 'present']) assert.ok(existsSync(join(vdir, sub, `${s}.png`)), `${sub}/${s}`);
    assert.ok(!existsSync(join(repo, '.claude', 'cycle', runId, 'visual-base')), 'base worktree removed');
    assert.doesNotMatch(spawnSync('git', ['-C', repo, 'worktree', 'list'], { encoding: 'utf8' }).stdout, /visual-base/);
    assert.equal(stubCalls(repo).filter((l) => / 4 /.test(l)).length, 1, 'stage 4 ran once; it captured nothing');
  } finally {
    delete process.env.STUB_VISUAL;
  }
});

test('a broken capture command parks the slice with the capture error, without rerunning stage 4', async () => {
  process.env.STUB_MODE = 'ok';
  process.env.STUB_VISUAL = 'ok';
  process.env.STUB_CAPTURE_FAIL = '1';
  try {
    const repo = withVisual(fixtureRepo({ max_runs: 1 }));
    assert.equal(await runLoop(repo), '1 runs finished');
    const run = Object.values(loopJson(repo).runs)[0];
    assert.equal(run.finished, 'parked');
    assert.match(loopJson(repo).parked[0].reason, /visual captures failed: before: failed editor/);
    assert.equal(stubCalls(repo).filter((l) => / 4 /.test(l)).length, 1);
    assert.ok(!run.published, 'a parked run is not published');
  } finally {
    delete process.env.STUB_VISUAL;
    delete process.env.STUB_CAPTURE_FAIL;
  }
});

test('the status server serves visual decisions, images and the review routes', async () => {
  process.env.STUB_MODE = 'ok';
  process.env.STUB_VISUAL = 'ok';
  try {
    const repo = withVisual(fixtureRepo({ max_runs: 1 }));
    await runLoop(repo);
    const server = startStatusServer(repo, 0);
    await new Promise((r) => server.once('listening', r));
    const { port } = server.address();
    const call = (method, path, body) => new Promise((done) => {
      const req = request({ host: '127.0.0.1', port, path, method, headers: { 'Content-Type': 'application/json' } }, (res) => {
        let text = '';
        res.on('data', (c) => { text += c; });
        res.on('end', () => done({ status: res.statusCode, type: res.headers['content-type'], text }));
      });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
    const vis = JSON.parse((await call('GET', '/visual.json')).text);
    assert.equal(vis.enabled, true);
    assert.equal(vis.decisions.length, 2);
    const img = await call('GET', `/visual-file?path=${encodeURIComponent(vis.decisions[1].after)}`);
    assert.equal(img.status, 200);
    assert.match(img.type, /image\/png/);
    assert.equal((await call('GET', '/visual-file?path=../../etc/passwd')).status, 404, 'paths outside .claude are refused');
    const rated = await call('POST', '/visual/rate', { id: vis.decisions[0].id, rating: 'agree' });
    assert.equal(rated.status, 200, rated.text);
    assert.equal(JSON.parse((await call('GET', '/visual.json')).text).agreement.rate, 1);
    const rb = await call('POST', '/visual/rollback', { state: 'present' });
    assert.equal(rb.status, 400, 'no history to roll back to');
    server.close();
  } finally {
    delete process.env.STUB_VISUAL;
  }
});

test('visualFilePath allows only PNGs under .claude/visual and .claude/cycle', () => {
  const repo = mkdtempSync(join(tmpdir(), 'vp-'));
  assert.ok(visualFilePath(repo, '.claude/visual/baseline/a.png'));
  assert.ok(visualFilePath(repo, '.claude/cycle/r1/visual/after/a.png'));
  assert.equal(visualFilePath(repo, '.claude/visual/contract.json'), null);
  assert.equal(visualFilePath(repo, '.claude/visual/../../secret.png'), null);
});

// --- status page data: stage timing, card cleanup, PR state ---------------------------------

test('stages record when they started, and a run past planning closes its slice-pick card', async () => {
  process.env.STUB_MODE = 'ok';
  const repo = fixtureRepo({ max_runs: 1 });
  await runLoop(repo);
  const [id, run] = Object.entries(loopJson(repo).runs)[0];
  for (const n of ['1', '2', '3', '4', '5']) assert.ok(run.stages[n].started <= run.stages[n].at, `stage ${n} has a start before its end`);
  assert.match(readFileSync(join(repo, '.claude', 'cycle', id, 'cards', 'slice-pick.md'), 'utf8'), /status: resolved/);
});

test('status cards hide old slice picks and mark setup notices as info', async () => {
  process.env.STUB_MODE = 'ok';
  const repo = fixtureRepo({ max_runs: 1 });
  await runLoop(repo);
  const id = Object.keys(loopJson(repo).runs)[0];
  const cards = join(repo, '.claude', 'cycle', id, 'cards');
  writeFileSync(join(cards, 'slice-pick.md'), '---\nkind: card\nstatus: open\n---\n# Slice picked: A1\n');
  writeFileSync(join(cards, 'ignored-claude-dir.md'), '---\nkind: card\nstatus: open\n---\n# .claude/ is ignored but tracked\n');
  const { cards: open } = statusJson(repo);
  assert.ok(!open.some((c) => c.card === 'slice-pick.md'), 'a finished run cannot swap its slice any more');
  assert.equal(open.find((c) => c.card === 'ignored-claude-dir.md').kind, 'info');
});

// --- review and merge (merge: on) ---------------------------------------------------------

const ghState = (repo) => JSON.parse(readFileSync(join(repo, '.claude', 'cycle', 'gh-state.json'), 'utf8'));

/** Runs the loop with merge settings and stub envs, cleaning the envs after. */
async function mergeRun(config, env = {}, prepare = (r) => r) {
  process.env.STUB_MODE = 'ok';
  Object.assign(process.env, env);
  try {
    const repo = prepare(fixtureRepo({ max_runs: 1, merge: 'on', ...config }));
    const reason = await runLoop(repo);
    return { repo, reason, run: Object.values(loopJson(repo).runs)[0] };
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
  }
}

test('ciState reads check runs and status contexts', () => {
  assert.equal(ciState([]), 'pass', 'no checks');
  assert.equal(ciState([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }, { status: 'COMPLETED', conclusion: 'SKIPPED' }]), 'pass');
  assert.equal(ciState([{ status: 'IN_PROGRESS', conclusion: null }, { status: 'COMPLETED', conclusion: 'SUCCESS' }]), 'pending');
  assert.equal(ciState([{ state: 'PENDING' }]), 'pending');
  assert.equal(ciState([{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', conclusion: 'FAILURE' }]), 'fail', 'a failure wins over pending');
  assert.equal(ciState([{ state: 'ERROR' }]), 'fail');
});

test('merge on: an approving review, passing checks and no open blocks squash-merge the run PR, with one comment', async () => {
  const { repo, reason, run } = await mergeRun({}, { STUB_CHECKS: 'pass' });
  assert.equal(reason, '1 runs finished', 'the run counts as finished only after its review');
  assert.match(run.review, /^merged #100 \(squash\)/);
  const gh = ghState(repo);
  assert.deepEqual(gh.merged, [{ number: 100, method: '--squash' }]);
  assert.equal(gh.prs[100].isDraft, false, 'the draft was marked ready first');
  assert.equal(gh.comments.length, 1);
  assert.match(gh.comments[0].body, /^\*\*Automated review \(cycle\)\*\*/);
  assert.ok(stubCalls(repo).includes('review 100 opus'), 'the review ran as its own session on models.review');
});

test('merge off: no review session and no merge', async () => {
  const { repo, run } = await mergeRun({ merge: 'off' }, { STUB_CHECKS: 'pass' });
  assert.ok(!stubCalls(repo).some((l) => l.startsWith('review ')));
  assert.equal(ghState(repo).merged, undefined);
  assert.ok(!run.review);
});

test('failing checks keep the PR open with a note, after the comment', async () => {
  const { repo, run } = await mergeRun({}, { STUB_CHECKS: 'fail' });
  assert.match(run.review, /not merged: checks failed/);
  assert.equal(ghState(repo).merged, undefined);
  assert.equal(ghState(repo).comments.length, 1);
});

test('a rejected merge (branch rules) is recorded, not forced', async () => {
  const { repo, run } = await mergeRun({}, { STUB_CHECKS: 'pass', STUB_MERGE_FAIL: '1' });
  assert.match(run.review, /merge failed: .*rule violations/);
  assert.ok(!readFileSync(join(repo, '.claude', 'cycle', 'gh-calls.log'), 'utf8').includes('--admin'));
});

test('changes requested on its own run send it back to stage 4; the fix updates the same PR, then it merges', async () => {
  const { repo, run } = await mergeRun({}, { STUB_CHECKS: 'pass', STUB_REVIEW: 'changes-once' });
  assert.equal(run.review_rounds, 1);
  assert.match(run.review, /^merged #100/);
  assert.equal(stubCalls(repo).filter((l) => / 4 /.test(l)).length, 2, 'stage 4 ran again for the fix');
  const creates = readFileSync(join(repo, '.claude', 'cycle', 'gh-calls.log'), 'utf8').split('\n').filter((l) => l.startsWith('pr create'));
  assert.equal(creates.length, 1, 'the rerun pushed to the open PR instead of opening another');
  assert.equal(ghState(repo).comments.length, 2, 'one comment per review');
});

test('a rerun reuses its open PR even when max_open_prs is reached', async () => {
  // The first publish takes the only slot; the rerun after the review must not wait on its own PR.
  const { repo, run } = await mergeRun({ max_open_prs: 1 }, { STUB_CHECKS: 'pass', STUB_REVIEW: 'changes-once' });
  assert.match(run.review, /^merged #100/, 'the fix went to PR #100 instead of waiting for a free slot');
  assert.equal(readFileSync(join(repo, '.claude', 'cycle', 'gh-calls.log'), 'utf8').split('\n').filter((l) => l.startsWith('pr create')).length, 1);
});

test('changes requested until the retry cap park the run and leave the PR open', async () => {
  const { repo, run } = await mergeRun({}, { STUB_CHECKS: 'pass', STUB_REVIEW: 'changes' });
  assert.equal(run.finished, 'parked');
  assert.match(loopJson(repo).parked[0].reason, /review still asks for changes after 3 rounds/);
  assert.equal(ghState(repo).merged, undefined);
});

test('with a visual contract, the merge follows the critic: approved runs merge, a broken capture never reaches review', async () => {
  const ok = await mergeRun({}, { STUB_CHECKS: 'pass', STUB_VISUAL: 'ok' }, withVisual);
  assert.match(ok.run.visual, /^approved/);
  assert.match(ok.run.review, /^merged #100/);
  assert.equal(decisions(ok.repo).length, 2, 'the critic judged before the merge');
  const broken = await mergeRun({}, { STUB_CHECKS: 'pass', STUB_VISUAL: 'ok', STUB_CAPTURE_FAIL: '1' }, withVisual);
  assert.equal(broken.run.finished, 'parked');
  assert.ok(!broken.run.review, 'a parked run is never reviewed or merged');
});

test('a labeled PR is reviewed once per head commit and merged when the gate holds; changes only get a comment', async () => {
  const labeled = JSON.stringify([{ number: 77, headRefName: 'someone/feature', headRefOid: 'abc123' }]);
  const { repo } = await mergeRun({ max_runs: 1 }, { STUB_CHECKS: 'pass', STUB_LABELED_PRS: labeled });
  const loop = loopJson(repo);
  assert.match(loop.reviews[77].review, /^merged #77 \(squash\)/);
  assert.equal(loop.reviews[77].reviewed_sha, 'abc123');
  assert.equal(stubCalls(repo).filter((l) => l.startsWith('review 77 ')).length, 1, 'reviewed once at that head');
  const changed = await mergeRun({ max_runs: 1 }, { STUB_CHECKS: 'pass', STUB_LABELED_PRS: labeled, STUB_REVIEW: 'changes' });
  const rec = loopJson(changed.repo).reviews[77];
  assert.match(rec.review, /changes requested on #77; commented, not merged/);
  assert.ok(!(ghState(changed.repo).merged || []).some((m) => m.number === 77));
});

test('a PR that targets another branch is skipped without a review session', async () => {
  const labeled = JSON.stringify([{ number: 78, headRefName: 'x/y', headRefOid: 'def', baseRefName: 'release' }]);
  const { repo } = await mergeRun({}, { STUB_CHECKS: 'pass', STUB_LABELED_PRS: labeled });
  assert.match(loopJson(repo).reviews[78].review, /targets release, not main/);
  assert.ok(!stubCalls(repo).some((l) => l.startsWith('review 78 ')));
});

test('PR state comes from read-only gh, cached between polls', async () => {
  process.env.STUB_MODE = 'ok';
  const repo = fixtureRepo({ max_runs: 1 });
  await runLoop(repo);
  const prs = prsJson(repo);
  const [url, state] = Object.entries(prs)[0];
  assert.match(url, /\/pull\/\d+$/);
  assert.deepEqual(state, { state: 'open', draft: true, merged: false, checks: { pass: 1, fail: 1, pending: 1 } });
  const views = () => readFileSync(join(repo, '.claude', 'cycle', 'gh-calls.log'), 'utf8').split('\n').filter((l) => l.startsWith('pr view')).length;
  const before = views();
  prsJson(repo);
  assert.equal(views(), before, 'second poll within a minute uses the cache');
});
