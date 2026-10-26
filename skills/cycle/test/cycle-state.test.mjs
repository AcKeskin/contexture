// Tests for cycle-state.mjs. Run: node --test skills/cycle/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readCompletion, readFrontmatter, setupGaps, setupEnv, envVar, resolvesOnPath, baselineSection, TEMPLATE_LIMIT, linksOutside } from '../cycle-state.mjs';

// A directory link that needs no admin rights on Windows.
const DIR_LINK = process.platform === 'win32' ? 'junction' : 'dir';

/** A git repo with one commit, a run folder, and a node_modules folder holding one file. */
function gitRepoWithRun() {
  const root = repo();
  const git = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(root, 'README.md'), 'x\n');
  git('add', 'README.md');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init'); // share-readiness: WONT_FIX — fake identity for a fixture commit
  cycle(root, 'init', RUN);
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'node_modules', 'keep.txt'), 'main checkout file\n');
  return { root, git };
}

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'cycle-state.mjs');
const RUN = '2026-10-25-probe';

function repo() {
  return mkdtempSync(join(tmpdir(), 'cycle-'));
}

function cycle(root, ...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args, '--root', root], { encoding: 'utf8' });
}

function runFile(root, name) {
  return join(root, '.claude', 'cycle', RUN, name);
}

test('linksOutside finds a link that leaves the folder and ignores one that stays inside', () => {
  const { root } = gitRepoWithRun();
  const run = runFile(root, '');
  mkdirSync(join(run, 'wt', 'lib'), { recursive: true });
  symlinkSync(join(root, 'node_modules'), join(run, 'wt', 'node_modules'), DIR_LINK);
  symlinkSync(join(run, 'wt', 'lib'), join(run, 'wt', 'lib-link'), DIR_LINK);
  const found = linksOutside(run);
  assert.equal(found.length, 1);
  assert.match(found[0].link, /node_modules$/);
});

test('remove-worktree unlinks a linked node_modules before removing, so the main checkout keeps its files', () => {
  const { root, git } = gitRepoWithRun();
  const wt = runFile(root, 'wt');
  assert.equal(git('worktree', 'add', '-q', '--detach', wt).status, 0);
  symlinkSync(join(root, 'node_modules'), join(wt, 'node_modules'), DIR_LINK);
  const r = cycle(root, 'remove-worktree', RUN, wt);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /unlinked .*node_modules/);
  assert.ok(!existsSync(wt), 'worktree removed');
  assert.equal(readFileSync(join(root, 'node_modules', 'keep.txt'), 'utf8'), 'main checkout file\n');
  assert.doesNotMatch(git('worktree', 'list').stdout, /[\\/]wt\b/);
});

test('remove-worktree refuses a path outside the run folder', () => {
  const { root } = gitRepoWithRun();
  const r = cycle(root, 'remove-worktree', RUN, join(root, 'node_modules'));
  assert.equal(r.status, 2);
  assert.ok(existsSync(join(root, 'node_modules', 'keep.txt')));
});

test('init writes the four files and cards/', () => {
  const root = repo();
  assert.equal(cycle(root, 'init', RUN).status, 0);
  for (const f of ['setup.md', 'audit.md', 'contract.md', 'log.md', 'cards']) {
    assert.ok(existsSync(runFile(root, f)), f);
  }
  assert.match(readFileSync(runFile(root, 'contract.md'), 'utf8'), /retry_cap: 3/);
});

test('init refuses an existing run', () => {
  const root = repo();
  cycle(root, 'init', RUN);
  assert.equal(cycle(root, 'init', RUN).status, 2);
});

test('check exits 1 while an item lacks evidence', () => {
  const root = repo();
  cycle(root, 'init', RUN);
  const r = cycle(root, 'check', RUN);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /missing evidence: tests/);
});

test('check exits 0 when every item has evidence', () => {
  const root = repo();
  cycle(root, 'init', RUN);
  const file = runFile(root, 'contract.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/evidence:$/gm, 'evidence: tests/run.sh -> 344 tests, 0 failed'));
  const r = cycle(root, 'check', RUN);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /all 5 completion items have evidence/);
});

test('log appends a line', () => {
  const root = repo();
  cycle(root, 'init', RUN);
  assert.equal(cycle(root, 'log', RUN, 'stage', '1', 'audit', 'started').status, 0);
  assert.match(readFileSync(runFile(root, 'log.md'), 'utf8'), /stage 1 audit started\n$/);
});

test('status reports completion and open cards', () => {
  const root = repo();
  cycle(root, 'init', RUN);
  const r = cycle(root, 'status', RUN);
  assert.match(r.stdout, /completion: 0\/5 with evidence/);
  assert.match(r.stdout, /open cards: none/);
});

test('setup-check blocks on a missing engine path', () => {
  const root = repo();
  cycle(root, 'init', RUN);
  writeFileSync(runFile(root, 'setup.md'), readFileSync(join(dirname(SCRIPT), 'test', 'fixtures', 'setup-missing-engine.md'), 'utf8'));
  const r = cycle(root, 'setup-check', RUN);
  assert.equal(r.status, 1);
  const setup = readFileSync(runFile(root, 'setup.md'), 'utf8');
  assert.match(setup, /\| engine \| path not found: \/nonexistent\/godot \|/);
  assert.deepEqual(readdirSync(runFile(root, 'cards')), ['setup-engine.md']);
  assert.match(readFileSync(runFile(root, 'cards/setup-engine.md'), 'utf8'), /kind: block/);
  assert.match(cycle(root, 'status', RUN).stdout, /open cards: setup-engine.md/);
  assert.doesNotMatch(readFileSync(runFile(root, 'audit.md'), 'utf8'), /\| /, 'audit stays empty');
});

test('setup-check passes once the gap is fixed, and drops the gaps section', () => {
  const root = repo();
  cycle(root, 'init', RUN);
  const fixture = readFileSync(join(dirname(SCRIPT), 'test', 'fixtures', 'setup-missing-engine.md'), 'utf8');
  writeFileSync(runFile(root, 'setup.md'), fixture);
  cycle(root, 'setup-check', RUN);
  const fixed = readFileSync(runFile(root, 'setup.md'), 'utf8').replace('/nonexistent/godot', process.execPath.replace(/\\/g, '/'));
  writeFileSync(runFile(root, 'setup.md'), fixed);
  const r = cycle(root, 'setup-check', RUN);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(readFileSync(runFile(root, 'setup.md'), 'utf8'), /## Gaps/);
  assert.match(readFileSync(runFile(root, 'cards/setup-engine.md'), 'utf8'), /status: resolved/);
  assert.match(cycle(root, 'status', RUN).stdout, /open cards: none/);
});

test('setupGaps flags a run branch equal to the base', () => {
  const gaps = setupGaps({ write_scope: { base_branch: 'develop', run_branch: 'develop' } }, '.');
  assert.deepEqual(gaps.map((g) => g.why), ['run branch equals the base branch']);
});

test('template fills the run and stays under the Projects limit', () => {
  const root = repo();
  cycle(root, 'init', RUN);
  writeFileSync(runFile(root, 'setup.md'), readFileSync(join(dirname(SCRIPT), 'test', 'fixtures', 'setup-missing-engine.md'), 'utf8'));
  const r = cycle(root, 'template', RUN);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.length < TEMPLATE_LIMIT, `${r.stdout.length} characters`);
  assert.match(r.stdout, /Run id: 2026-10-25-probe\./);
  assert.match(r.stdout, /Never push to develop, never force-push, never merge\./);
  assert.match(r.stdout, /Start threads without asking/);
  assert.match(r.stdout, /at most 5 web searches and 3 reads/);
  assert.match(r.stdout, /at most 3 rounds/);
  assert.match(r.stdout, /- Retry cap hit, or the same failure fingerprint 3 times: block/);
  assert.match(r.stdout, /- The project's test command passes/);
  assert.doesNotMatch(r.stdout, /\{\{/, 'no unfilled fields');
});

test('runs when called through a linked folder, as bootstrap installs it', () => {
  const root = repo();
  const link = join(mkdtempSync(join(tmpdir(), 'cycle-link-')), 'cycle');
  symlinkSync(dirname(SCRIPT), link, 'junction');
  const r = spawnSync(process.execPath, [join(link, 'cycle-state.mjs'), 'init', RUN, '--root', root], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /created /);
  assert.ok(existsSync(runFile(root, 'contract.md')));
});

test('log lines say UTC', () => {
  const root = repo();
  cycle(root, 'init', RUN);
  assert.match(readFileSync(runFile(root, 'log.md'), 'utf8'), /- \d{4}-\d\d-\d\d \d\d:\d\d UTC init/);
});

function setupWith(root, frontmatter) {
  writeFileSync(runFile(root, 'setup.md'), `---\n${frontmatter}\n---\n# Setup\n`);
}

const NODE_DIR = dirname(process.execPath).replace(/\\/g, '/');

test('declared env PATH is used to resolve commands', () => {
  const fm = readFrontmatter(`---\ncommands:\n  test: node -v\nenv:\n  PATH: ${NODE_DIR}\nwrite_scope:\n  base_branch: main\n  run_branch: after-slice\n---\n`);
  assert.deepEqual(setupGaps(fm, '.', setupEnv(fm, {})), []);
  assert.equal(setupGaps(fm, '.', {}).length, 1, 'without the env block node is not found');
});

test('a Windows env spelled Path still resolves commands', { skip: process.platform !== 'win32' }, () => {
  const env = { Path: NODE_DIR, PATHEXT: '.EXE;.CMD' };
  assert.equal(resolvesOnPath('node -v', env), true);
  assert.equal(resolvesOnPath('node -v', setupEnv({}, env)), true);
});

test('envVar matches case only on Windows', () => {
  assert.equal(envVar({ Path: 'a' }, 'PATH', 'win32'), 'a');
  assert.equal(envVar({ Path: 'a' }, 'PATH', 'linux'), undefined);
});

test('a declared PATH replaces the shell Path on Windows', () => {
  assert.deepEqual(setupEnv({ env: { PATH: 'declared' } }, { Path: 'shell', HOME: 'h' }, 'win32'), { HOME: 'h', PATH: 'declared' });
  assert.deepEqual(setupEnv({ env: { PATH: 'declared' } }, { Path: 'shell' }, 'linux'), { Path: 'shell', PATH: 'declared' });
});

test('a command with an env prefix is a gap', () => {
  const gaps = setupGaps({ commands: { e2e: 'SHOTS=1 npx playwright test' }, write_scope: { base_branch: 'main', run_branch: 'x' } }, '.');
  assert.deepEqual(gaps.map((g) => g.why), ['command starts with an env assignment; move it to env:']);
});

test('quoted values keep their inner quotes', () => {
  assert.equal(readFrontmatter('---\nsmoke: node -e "process.exit(0)"\n---\n').smoke, 'node -e "process.exit(0)"');
  assert.equal(readFrontmatter('---\na: "x y"\n---\n').a, 'x y');
});

test('a green smoke command records the baseline', () => {
  const root = repo();
  cycle(root, 'init', RUN);
  setupWith(root, 'commands:\n  smoke: node -e "console.log(\'12 passed\')"\nwrite_scope:\n  base_branch: main\n  run_branch: after-slice');
  const r = cycle(root, 'setup-check', RUN);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const setup = readFileSync(runFile(root, 'setup.md'), 'utf8');
  assert.match(setup, /## Baseline[\s\S]*exited 0 \(green\)[\s\S]*12 passed/);
});

test('the baseline keeps the end of stdout, apart from stderr noise', () => {
  const text = baselineSection('npm test', 0, 'vite noise\n12 passed\n', 'warn a\nwarn b\n');
  assert.match(text, /12 passed\nstderr:\nwarn a\nwarn b/);
});

test('a red smoke command is a block gap', () => {
  const root = repo();
  cycle(root, 'init', RUN);
  setupWith(root, 'commands:\n  smoke: node -e "process.exit(3)"\nwrite_scope:\n  base_branch: main\n  run_branch: after-slice');
  const r = cycle(root, 'setup-check', RUN);
  assert.equal(r.status, 1);
  assert.match(readFileSync(runFile(root, 'setup.md'), 'utf8'), /exited 3 \(red\)/);
  assert.match(readFileSync(runFile(root, 'cards/setup-smoke.md'), 'utf8'), /kind: block/);
});

test('setup-check warns when a tracked .claude/ is ignored', () => {
  const root = repo();
  const git = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });
  git('init', '-q');
  mkdirSync(join(root, '.claude', 'specs'), { recursive: true });
  writeFileSync(join(root, '.claude', 'specs', 'a.md'), 'x');
  git('add', '-f', '.claude/specs/a.md');
  writeFileSync(join(root, '.git', 'info', 'exclude'), '.claude/\n');
  cycle(root, 'init', RUN);
  setupWith(root, 'write_scope:\n  base_branch: main\n  run_branch: after-slice');
  const r = cycle(root, 'setup-check', RUN);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /git add -f/);
  assert.match(readFileSync(runFile(root, 'cards/ignored-claude-dir.md'), 'utf8'), /kind: card/);
});

test('outcome records a stage in its own file, never loop.json, and rejects unknown states', () => {
  const root = repo();
  assert.equal(cycle(root, 'outcome', RUN, '3', 'done').status, 2, 'no such run');
  cycle(root, 'init', RUN);
  assert.equal(cycle(root, 'outcome', RUN, '3', 'done', 'plan', 'steps', 'verified').status, 0);
  const written = JSON.parse(readFileSync(join(root, '.claude', 'cycle', RUN, 'outcome-3.json'), 'utf8'));
  assert.equal(written.outcome, 'done');
  assert.equal(written.note, 'plan steps verified');
  assert.equal(existsSync(join(root, '.claude', 'cycle', 'loop.json')), false);
  assert.equal(cycle(root, 'outcome', RUN, '3', 'finished').status, 2);
  assert.equal(cycle(root, 'outcome', RUN, '9', 'done').status, 2);
});

test('outcome run from inside the run worktree, without --root, lands in the repo', () => {
  const root = repo();
  cycle(root, 'init', RUN);
  const wt = join(root, '.claude', 'cycle', RUN, 'wt', 'src');
  mkdirSync(wt, { recursive: true });
  const r = spawnSync(process.execPath, [SCRIPT, 'outcome', RUN, '4', 'done', 'review clean'], { cwd: wt, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(root, '.claude', 'cycle', RUN, 'outcome-4.json')));
  assert.ok(!existsSync(join(root, '.claude', 'cycle', RUN, 'wt', '.claude')), 'nothing written under the worktree');
  assert.match(r.stdout, /outcome-4\.json/);
  const elsewhere = spawnSync(process.execPath, [SCRIPT, 'outcome', RUN, '4', 'done'], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(elsewhere.status, 2);
  assert.match(elsewhere.stderr, /pass --root/);
});

test('readCompletion parses id, item and evidence', () => {
  const items = readCompletion('## Completion items\n\n- id: a\n  item: thing\n  evidence: done\n- id: b\n  item: other\n  evidence:\n');
  assert.deepEqual(items, [{ id: 'a', item: 'thing', evidence: 'done' }, { id: 'b', item: 'other', evidence: '' }]);
});
