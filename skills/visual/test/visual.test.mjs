// Tests for visual.mjs. Run: node --test skills/visual/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  readContract, readTokens, tokenDrift, normValue, regionDiff, styleFindings, contrast,
  criticStates, criticInput, verdictProblems, record, rollback, rate, agreement, staleCaptures, visualStatus,
} from '../visual.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'visual.mjs');
const DRAW = join(HERE, 'fixtures', 'draw.mjs').replace(/\\/g, '/');
process.env.PNGJS_PATH = createRequire(import.meta.url).resolve('pngjs');
Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', // share-readiness: WONT_FIX — fake identity for fixture commits
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com', // share-readiness: WONT_FIX — fake identity for fixture commits
});
const RUN = '2026-10-25-run1';

const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' });
const draw = (out, bg, box = '', rect = '') => `node ${DRAW} ${out} ${bg} ${box} ${rect}`.trim();

/** A repo with canonical tokens, a CSS copy that differs in one token, two states and a contract. */
function fixtureRepo(contractExtra = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'visual-'));
  git(repo, 'init', '-q', '-b', 'main');
  mkdirSync(join(repo, 'design'), { recursive: true });
  writeFileSync(join(repo, 'design', 'tokens.json'), JSON.stringify({ color: { bg: '#110E18', accent: '#c9a04e', text: '#f2e8d5' }, size: { body: '16px', title: '24px' } }));
  writeFileSync(join(repo, 'design', 'theme.css'), ':root { --color-bg: #110e18; --color-accent: #d4af37; --color-text: #F2E8D5; }\n');
  mkdirSync(join(repo, 'shots'), { recursive: true });
  spawnSync(draw('shots/editor.png', '#110e18'), { cwd: repo, shell: true });
  writeFileSync(join(repo, 'ref.png'), readFileSync(join(repo, 'shots', 'editor.png')));
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  mkdirSync(join(repo, '.claude', 'visual'), { recursive: true });
  const contract = {
    tokens: { source: 'design/tokens.json', copies: ['design/theme.css', 'docs/design-doc-tab'] },
    references: [{ file: 'ref.png', take: 'calm dark panels' }],
    states: [
      { id: 'editor', shows: 'deck editor, slide 2 open', command: draw('shots/editor.png', '#110e18', '#c9a04e', '10,10,10,10'), output: 'shots/editor.png' },
      { id: 'present', shows: 'present mode', command: draw('out/present.png', '#110e18'), output: 'out/present.png' },
    ],
    ...contractExtra,
  };
  writeFileSync(join(repo, '.claude', 'visual', 'contract.json'), JSON.stringify(contract, null, 2));
  return repo;
}

const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const runVisual = (repo) => join(repo, '.claude', 'cycle', RUN, 'visual');

function captureAfter(repo) {
  return cli('capture', repo, '--out', join(runVisual(repo), 'after'), '--tree', repo);
}

/** Before captures as the base would draw them: no box on the editor. */
function drawBefore(repo) {
  const before = join(runVisual(repo), 'before');
  spawnSync(draw(join(before, 'editor.png').replace(/\\/g, '/'), '#110e18'), { shell: true });
  spawnSync(draw(join(before, 'present.png').replace(/\\/g, '/'), '#110e18'), { shell: true });
}

test('touched picks the states whose after differs from before above the noise, and writes touched.json', () => {
  const repo = fixtureRepo();
  drawBefore(repo);
  assert.equal(captureAfter(repo).status, 0);
  const r = cli('touched', repo, RUN, '--tree', repo);
  assert.equal(r.status, 0, r.stderr);
  const touched = JSON.parse(readFileSync(join(runVisual(repo), 'touched.json'), 'utf8'));
  assert.deepEqual(touched.states, ['editor'], 'the box shows; present is unchanged');
  assert.equal(touched.diffs.present.touched, false);
  assert.equal(touched.tree, repo);
  assert.ok(existsSync(join(runVisual(repo), 'diff-editor.png')));
});

test('touched respects a state\'s own noise floor', () => {
  const repo = fixtureRepo();
  const file = join(repo, '.claude', 'visual', 'contract.json');
  const c = JSON.parse(readFileSync(file, 'utf8'));
  c.states[0].noise = 0.2;
  writeFileSync(file, JSON.stringify(c));
  drawBefore(repo);
  captureAfter(repo);
  const touched = JSON.parse(cli('touched', repo, RUN, '--tree', repo).stdout);
  assert.deepEqual(touched.states, [], 'an 8% change is under a 20% floor');
});

test('record expects verdicts for the touched states plus one sibling, not for every captured state', () => {
  const repo = fixtureRepo();
  const file = join(repo, '.claude', 'visual', 'contract.json');
  const c = JSON.parse(readFileSync(file, 'utf8'));
  c.states.push({ id: 'grid', shows: 'slide grid', command: draw('out/grid.png', '#110e18'), output: 'out/grid.png' });
  writeFileSync(file, JSON.stringify(c));
  drawBefore(repo);
  spawnSync(draw(join(runVisual(repo), 'before', 'grid.png').replace(/\\/g, '/'), '#110e18'), { shell: true });
  assert.equal(captureAfter(repo).status, 0);
  assert.deepEqual(JSON.parse(cli('touched', repo, RUN, '--tree', repo).stdout).states, ['editor']);
  const verdicts = [
    { state: 'editor', verdict: 'consistent', contract_line: 'tokens: accent', evidence: 'box uses #c9a04e', checked_against_code: true },
    { state: 'present', verdict: 'consistent', contract_line: 'tokens: bg', evidence: 'plain #110e18', checked_against_code: true },
  ];
  const r = record(repo, RUN, verdicts, repo);
  assert.deepEqual(r.problems, [], 'two verdicts for three captured states are enough');
  assert.ok(existsSync(join(repo, '.claude', 'visual', 'baseline', 'editor.png')));
  assert.ok(!existsSync(join(repo, '.claude', 'visual', 'baseline', 'present.png')), 'the sibling keeps its baseline');
});

test('touched fails and names the states without both captures', () => {
  const repo = fixtureRepo();
  captureAfter(repo);
  const r = cli('touched', repo, RUN, '--tree', repo);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /missing before\/after captures: editor, present/);
});

const consistent = (state) => ({ state, verdict: 'consistent', contract_line: 'tokens: design/tokens.json', evidence: 'panel colors match tokens', checked_against_code: true });

test('the contract validates, and reports every problem at once', () => {
  const repo = fixtureRepo();
  assert.equal(readContract(repo).critic.scope, 'touched+1');
  writeFileSync(join(repo, '.claude', 'visual', 'contract.json'), JSON.stringify({ tokens: { source: 'nope.json' }, states: [{ id: 'Bad Id' }] }));
  assert.throws(() => readContract(repo), /tokens.source not found[\s\S]*has no command[\s\S]*must be lowercase/);
});

test('tokens read from nested JSON and CSS compare equal after normalizing', () => {
  const repo = fixtureRepo();
  const canon = readTokens(join(repo, 'design', 'tokens.json'));
  assert.equal(canon['color-bg'], '#110e18');
  assert.equal(normValue('rgb(17, 14, 24)'), '#110e18');
  const copy = readTokens(join(repo, 'design', 'theme.css'));
  assert.deepEqual(tokenDrift(canon, copy), [{ token: 'color-accent', canonical: '#c9a04e', copy: '#d4af37' }]);
});

test('drift writes exactly one card naming both files and the token', () => {
  const repo = fixtureRepo();
  const r = cli('drift', repo);
  assert.equal(r.status, 0, r.stderr);
  const cards = readdirSync(join(repo, '.claude', 'visual', 'cards'));
  assert.equal(cards.length, 1);
  const card = readFileSync(join(repo, '.claude', 'visual', 'cards', cards[0]), 'utf8');
  assert.match(card, /color-accent/);
  assert.match(card, /design\/tokens\.json[\s\S]*design\/theme\.css/);
  assert.match(r.stdout, /skip docs\/design-doc-tab/);
});

test('capture keeps each state image with a manifest and restores tracked output', () => {
  const repo = fixtureRepo();
  const r = captureAfter(repo);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const manifest = JSON.parse(readFileSync(join(runVisual(repo), 'after', 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.map((m) => m.state), ['editor', 'present']);
  assert.equal(manifest[0].commit, git(repo, 'rev-parse', 'HEAD').stdout.trim());
  assert.equal(git(repo, 'status', '--porcelain', 'shots').stdout.trim(), '', 'tracked shots/editor.png restored');
});

test('a capture older than the branch head is stale and record refuses it', () => {
  const repo = fixtureRepo();
  captureAfter(repo);
  writeFileSync(join(repo, 'change.txt'), 'x');
  git(repo, 'add', 'change.txt');
  git(repo, 'commit', '-q', '-m', 'later');
  const manifest = JSON.parse(readFileSync(join(runVisual(repo), 'after', 'manifest.json'), 'utf8'));
  assert.equal(staleCaptures(manifest, git(repo, 'rev-parse', 'HEAD').stdout.trim()).length, 2);
  const r = record(repo, RUN, [consistent('editor'), consistent('present')], repo);
  assert.match(r.problems.join('\n'), /capture of editor is from .*, not the branch head: retake it/);
  assert.equal(r.recorded.length, 0);
});

test('region diff is strict inside the touched region and loose outside', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diff-'));
  spawnSync(draw(join(dir, 'base.png').replace(/\\/g, '/'), '#110e18'), { shell: true });
  spawnSync(draw(join(dir, 'in.png').replace(/\\/g, '/'), '#110e18', '#c9a04e', '10,10,4,4'), { shell: true });
  spawnSync(draw(join(dir, 'out.png').replace(/\\/g, '/'), '#110e18', '#c9a04e', '30,20,8,8'), { shell: true });
  const region = { x: 8, y: 8, w: 10, h: 10 };
  const inside = regionDiff(join(dir, 'base.png'), join(dir, 'in.png'), region, join(dir, 'd.png'));
  assert.match(inside.finding, /changed inside the touched region/);
  assert.equal(inside.outside, 0);
  assert.ok(existsSync(join(dir, 'd.png')));
  const outside = regionDiff(join(dir, 'base.png'), join(dir, 'out.png'), region);
  assert.match(outside.finding, /changed outside the touched region/);
});

test('style checks flag off-contract color, low contrast and overflow', () => {
  const repo = fixtureRepo();
  const tokens = readTokens(join(repo, 'design', 'tokens.json'));
  const dump = [
    { state: 'editor', selector: '.title', color: '#f2e8d5', background: '#110e18', fontSize: '24px', scrollWidth: 100, clientWidth: 100 },
    { state: 'editor', selector: '.badge', color: 'rgb(255, 0, 255)', background: '#110e18', fontSize: '16px', scrollWidth: 100, clientWidth: 100 },
    { state: 'editor', selector: '.hint', color: '#110e18', background: '#110e18', fontSize: '13px', scrollWidth: 140, clientWidth: 100 },
  ];
  const f = styleFindings(dump, tokens, 'design/tokens.json');
  const checks = f.map((x) => `${x.selector} ${x.check}`);
  assert.ok(checks.includes('.badge off-contract color'));
  assert.ok(checks.includes('.hint off-contract font size'));
  assert.ok(checks.includes('.hint contrast below WCAG AA'));
  assert.ok(checks.includes('.hint horizontal overflow'));
  assert.ok(!checks.some((c) => c.startsWith('.title')), 'on-contract element has no findings');
  assert.ok(contrast('#ffffff', '#000000') > 20);
});

test('critic scope is touched plus one sibling by default, or all', () => {
  const repo = fixtureRepo();
  assert.deepEqual(criticStates(readContract(repo), ['present']), ['present', 'editor']);
  const all = fixtureRepo({ critic: { scope: 'all', image_cap: 4 } });
  assert.deepEqual(criticStates(readContract(all), ['present']), ['editor', 'present']);
});

test('critic input carries findings and stops at the image cap', () => {
  const repo = fixtureRepo({ critic: { scope: 'touched+1', image_cap: 2 } });
  captureAfter(repo);
  writeFileSync(join(runVisual(repo), 'findings.json'), JSON.stringify([{ state: 'editor', check: 'off-contract color', value: '#ff00ff' }]));
  const input = criticInput(repo, RUN, ['editor']);
  assert.equal(input.states[0].findings[0].value, '#ff00ff');
  assert.equal(input.images.length, 2);
  assert.ok(input.omitted >= 1);
  assert.ok(input.tells.some((t) => t.id === 'gradient-text'));
});

test('verdict validation needs a contract line, or a full taste record', () => {
  const ok = [consistent('editor'), { state: 'present', verdict: 'taste', evidence: 'two valid layouts', checked_against_code: true, taste: { chose: 'left rail', alternatives: ['top bar'], why: 'matches the editor' } }];
  assert.deepEqual(verdictProblems(ok, ['editor', 'present']), []);
  const bad = [{ state: 'editor', verdict: 'needs-revision', evidence: 'off', checked_against_code: false }, { state: 'present', verdict: 'taste', evidence: 'x', checked_against_code: true }];
  const problems = verdictProblems(bad, ['editor', 'present', 'help']).join('\n');
  assert.match(problems, /no verdict for state help/);
  assert.match(problems, /checked_against_code must be true/);
  assert.match(problems, /needs-revision needs contract_line and region/);
  assert.match(problems, /taste needs taste.chose/);
});

test('an approval moves the baseline and keeps the old one; rollback restores it', () => {
  const repo = fixtureRepo();
  captureAfter(repo);
  const first = record(repo, RUN, [consistent('editor'), consistent('present')], repo);
  assert.deepEqual(first.problems, []);
  const base = join(repo, '.claude', 'visual', 'baseline', 'editor.png');
  const v1 = readFileSync(base);
  const contractPath = join(repo, '.claude', 'visual', 'contract.json');
  const c = JSON.parse(readFileSync(contractPath, 'utf8'));
  c.states[0].command = draw('shots/editor.png', '#110e18', '#f2e8d5', '0,0,40,5');
  writeFileSync(contractPath, JSON.stringify(c));
  captureAfter(repo);
  const second = record(repo, RUN, [{ state: 'editor', verdict: 'taste', evidence: 'new header band', checked_against_code: true, taste: { chose: 'ivory band', alternatives: ['no band'], why: 'ties the title to the panel' } }, consistent('present')], repo);
  assert.deepEqual(second.problems, []);
  assert.notDeepEqual(readFileSync(base), v1, 'the critic moved the baseline');
  assert.equal(readdirSync(join(repo, '.claude', 'visual', 'history', 'editor')).length, 1, 'previous baseline kept');
  rollback(repo, 'editor');
  assert.deepEqual(readFileSync(base), v1, 'rollback restored the previous baseline');
  const decisions = readFileSync(join(repo, '.claude', 'visual', 'decisions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(decisions.length, 4);
  assert.ok(decisions.every((d) => d.after && d.contract_line !== undefined || d.taste));
});

test('a needs-revision verdict leaves the baseline alone', () => {
  const repo = fixtureRepo();
  captureAfter(repo);
  const r = record(repo, RUN, [{ state: 'editor', verdict: 'needs-revision', contract_line: 'tokens: color.accent', region: '10,10,10,10', evidence: 'accent box is the wrong gold', checked_against_code: true }, consistent('present')], repo);
  assert.deepEqual(r.problems, []);
  assert.ok(!existsSync(join(repo, '.claude', 'visual', 'baseline', 'editor.png')));
  assert.ok(existsSync(join(repo, '.claude', 'visual', 'baseline', 'present.png')));
});

test('the user rates decisions; a disagreed taste call proposes a contract change', () => {
  const repo = fixtureRepo();
  captureAfter(repo);
  const { recorded } = record(repo, RUN, [{ state: 'editor', verdict: 'taste', evidence: 'x', checked_against_code: true, taste: { chose: 'ivory band', alternatives: ['no band'], why: 'y' } }, consistent('present')], repo);
  rate(repo, recorded[0].id, 'disagree');
  rate(repo, recorded[1].id, 'agree');
  assert.deepEqual(agreement(repo), { rated: 2, agreed: 1, rate: 0.5 });
  const cards = readdirSync(join(repo, '.claude', 'visual', 'cards'));
  assert.ok(cards.some((c) => c.startsWith('contract-')));
  const status = visualStatus(repo);
  assert.equal(status.decisions[0].state, 'present', 'newest first');
  assert.equal(status.agreement.rate, 0.5);
  assert.equal(status.history.editor, 0);
});

// --- fixes from the first real setup --------------------------------------------------------

test('CSS var() fallbacks count as tokens when the file only uses host variables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'css-'));
  writeFileSync(join(dir, 'deck.css'), '.deck { color: var(--text-normal, #222); background: var(--background-primary, rgb(255, 255, 255)); }\n.a { border-color: var(--interactive-accent, #6965db); }\n:root { --own: #111111; }\n');
  const t = readTokens(join(dir, 'deck.css'));
  assert.equal(t['text-normal'], '#222222');
  assert.equal(t['background-primary'], '#ffffff');
  assert.equal(t['interactive-accent'], '#6965db');
  assert.equal(t.own, '#111111');
});

test('the critic input carries the token values, not only the file path', () => {
  const repo = fixtureRepo();
  captureAfter(repo);
  const input = criticInput(repo, RUN, ['editor']);
  assert.equal(input.contract.token_values['color-accent'], '#c9a04e');
});

test('states sharing a command run it once, and every tracked file it rewrote is restored', () => {
  const repo = fixtureRepo();
  spawnSync(draw('shots/saved.png', '#110e18'), { cwd: repo, shell: true });
  writeFileSync(join(repo, 'notes.txt'), 'original\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'more tracked files');
  writeFileSync(join(repo, 'notes.txt'), 'my unsaved edit\n');
  const shared = `${draw('shots/editor.png', '#110e18', '#c9a04e', '1,1,5,5')} && ${draw('shots/saved.png', '#110e18', '#f2e8d5', '1,1,5,5')} && node -e "require('fs').appendFileSync('runs.log','x')"`;
  const contractPath = join(repo, '.claude', 'visual', 'contract.json');
  const c = JSON.parse(readFileSync(contractPath, 'utf8'));
  c.states = [
    { id: 'editor', command: shared, output: 'shots/editor.png' },
    { id: 'saved-views', command: shared, output: 'shots/saved.png' },
  ];
  writeFileSync(contractPath, JSON.stringify(c));
  const r = captureAfter(repo);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(join(repo, 'runs.log'), 'utf8'), 'x', 'the shared command ran once');
  assert.ok(existsSync(join(runVisual(repo), 'after', 'saved-views.png')));
  assert.equal(git(repo, 'diff', '--name-only').stdout.trim(), 'notes.txt', 'both screenshots restored, the earlier edit kept');
});

test('a busy capture port fails the capture instead of shooting another tree', async () => {
  const repo = fixtureRepo();
  const { createServer } = await import('node:net');
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const contractPath = join(repo, '.claude', 'visual', 'contract.json');
  const c = JSON.parse(readFileSync(contractPath, 'utf8'));
  c.capture_port = server.address().port;
  writeFileSync(contractPath, JSON.stringify(c));
  const r = captureAfter(repo);
  server.close();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /port \d+ is already in use/);
});

test('diff has a noise floor, and says "across the frame" without a region', () => {
  const dir = mkdtempSync(join(tmpdir(), 'noise-'));
  spawnSync(draw(join(dir, 'base.png').replace(/\\/g, '/'), '#110e18'), { shell: true });
  spawnSync(draw(join(dir, 'speck.png').replace(/\\/g, '/'), '#110e18', '#c9a04e', '0,0,2,2'), { shell: true });
  spawnSync(draw(join(dir, 'big.png').replace(/\\/g, '/'), '#110e18', '#c9a04e', '0,0,20,20'), { shell: true });
  assert.match(regionDiff(join(dir, 'base.png'), join(dir, 'speck.png'), null).finding, /no change above the noise floor/);
  assert.match(regionDiff(join(dir, 'base.png'), join(dir, 'big.png'), null).finding, /changed across the frame/);
  assert.match(regionDiff(join(dir, 'base.png'), join(dir, 'speck.png'), null, null, 0).finding, /changed across the frame/, 'noise 0 reports any change');
});
