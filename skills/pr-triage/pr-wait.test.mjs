// node --test skills/pr-triage/pr-wait.test.mjs
// Drives pr-wait with a fake gh that serves one snapshot per poll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const SCRIPT = fileURLToPath(new URL('./pr-wait.mjs', import.meta.url));
const skip = process.platform === 'win32' ? 'fake gh is a shebang script' : false;

const FAKE = `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const dir = process.env.FAKE_GH_DIR;
const args = process.argv.slice(2);
if (args[0] === 'repo') { console.log(JSON.stringify({ owner: { login: 'me' }, name: 'repo' })); process.exit(0); }
const snaps = JSON.parse(fs.readFileSync(path.join(dir, 'snaps.json'), 'utf8'));
const cf = path.join(dir, 'count');
let n = 0; try { n = Number(fs.readFileSync(cf, 'utf8')); } catch {}
const s = snaps[Math.min(n, snaps.length - 1)];
if (args[0] === 'pr') { fs.writeFileSync(cf, String(n + 1)); const { threads, ...v } = s; console.log(JSON.stringify(v)); }
else console.log(JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: s.threads || [] } } } } }));
`;

function base(over = {}) {
  return {
    state: 'OPEN', mergeStateStatus: 'CLEAN', headRefOid: 'abc1234def', reviewDecision: '',
    statusCheckRollup: [], reviews: [], comments: [], author: { login: 'me' }, url: 'u', threads: [], ...over,
  };
}

// Each run in `runs` is [snaps, ...args]; all share one temp dir, so later runs are restarts.
function watchRuns(runs) {
  const dir = mkdtempSync(join(tmpdir(), 'pr-wait-'));
  const gh = join(dir, 'gh');
  writeFileSync(gh, FAKE);
  chmodSync(gh, 0o755);
  const pr = String(Math.floor(Math.random() * 1e9));
  const out = runs.map(([snaps, ...args]) => {
    writeFileSync(join(dir, 'snaps.json'), JSON.stringify(snaps));
    rmSync(join(dir, 'count'), { force: true });
    const r = spawnSync(process.execPath, [SCRIPT, pr, '--interval', '0', ...args], {
      env: { ...process.env, PR_WAIT_GH: gh, FAKE_GH_DIR: dir, TMPDIR: dir },
      encoding: 'utf8',
      timeout: 20000,
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  });
  rmSync(dir, { recursive: true, force: true });
  return out;
}

const watch = (snaps, ...args) => watchRuns([[snaps, ...args]])[0];

const check = (name, conclusion) => ({ name, status: conclusion ? 'COMPLETED' : 'IN_PROGRESS', conclusion: conclusion || '' });

test('pending then green with no threads: ready, exit 0', { skip }, () => {
  const r = watch([base({ statusCheckRollup: [check('test')] }), base({ statusCheckRollup: [check('test', 'SUCCESS')] })]);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /check passed: test/);
  assert.match(r.out, /done: ready/);
});

test('a failed check: needs you, exit 1', { skip }, () => {
  const r = watch([base({ statusCheckRollup: [check('lint', 'FAILURE')] })]);
  assert.equal(r.code, 1);
  assert.match(r.out, /check failed: lint \(failure\)/);
});

test('a reviewer comment: needs you; own comments are ignored', { skip }, () => {
  const mine = { id: 'c1', author: { login: 'me' }, body: 'note to self' };
  const theirs = { id: 'c2', author: { login: 'rev' }, body: 'please rename x\nmore' };
  let r = watch([base({ comments: [mine] }), base({ comments: [mine, theirs] })], '--until', 'any-change');
  assert.equal(r.code, 0);
  r = watch([base({ comments: [mine] })]);
  assert.equal(r.code, 0, 'own comment alone does not block ready');
  r = watch([base({ comments: [theirs] })]);
  assert.equal(r.code, 1);
  assert.match(r.out, /comment by rev: please rename x$/m);
});

test('open thread from a reviewer and a conflict: needs you', { skip }, () => {
  const thread = { id: 't1', isResolved: false, comments: { nodes: [{ author: { login: 'bot' }, path: 'src/a.ts' }] } };
  let r = watch([base({ threads: [thread] })]);
  assert.equal(r.code, 1);
  assert.match(r.out, /open thread on src\/a\.ts \(last: bot\)/);
  r = watch([base({ mergeStateStatus: 'DIRTY' })]);
  assert.equal(r.code, 1);
  assert.match(r.out, /merge conflict/);
});

test('merged: exit 0; --until green ignores threads', { skip }, () => {
  let r = watch([base({ state: 'MERGED' })]);
  assert.equal(r.code, 0);
  assert.match(r.out, /done: merged/);
  const thread = { id: 't1', isResolved: false, comments: { nodes: [{ author: { login: 'rev' }, path: 'x' }] } };
  r = watch([base({ threads: [thread], statusCheckRollup: [check('ci', 'SUCCESS')] })], '--until', 'green');
  assert.equal(r.code, 0);
});

test('changes requested: exits once, then a restart waits for the re-review', { skip }, () => {
  const review = { id: 'r1', author: { login: 'rev' }, state: 'CHANGES_REQUESTED' };
  const asked = base({ reviews: [review], reviewDecision: 'CHANGES_REQUESTED' });
  const approved = base({ reviews: [review, { id: 'r2', author: { login: 'rev' }, state: 'APPROVED' }], reviewDecision: 'APPROVED' });
  const [first, again] = watchRuns([[[asked]], [[asked, approved]]]);
  assert.equal(first.code, 1, first.out);
  assert.equal(again.code, 0, again.out + again.err);
  assert.match(again.out, /review approved by rev/);
});

test('a new reply in an open thread prints again', { skip }, () => {
  const t = (cid) => ({ id: 't1', isResolved: false, comments: { nodes: [{ id: cid, author: { login: 'rev' }, path: 'a.ts' }] } });
  const [first, again] = watchRuns([[[base({ threads: [t('c1')] })]], [[base({ threads: [t('c2')] })]]]);
  assert.equal(first.code, 1);
  assert.equal(again.code, 1);
  assert.match(again.out, /open thread on a\.ts/);
});

test('an EXPECTED status is pending, not passed', { skip }, () => {
  const r = watch([base({ statusCheckRollup: [{ context: 'ci/x', state: 'EXPECTED' }] })], '--timeout', '0.001');
  assert.equal(r.code, 3, r.out);
});

test('timeout: exit 3', { skip }, () => {
  const r = watch([base({ statusCheckRollup: [check('slow')] })], '--timeout', '0.001');
  assert.equal(r.code, 3);
  assert.match(r.out, /start pr-wait again/);
});

test('bad input: exit 2', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--until', 'soon'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
