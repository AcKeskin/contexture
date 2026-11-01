// node --test skills/review/receipts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const SCRIPT = fileURLToPath(new URL('./receipts.mjs', import.meta.url));
const run = (cwd, ...args) =>
  execFileSync(process.execPath, [SCRIPT, ...args], { cwd, env: { ...process.env, CLAUDE_PROJECT_DIR: cwd } }).toString();

test('stamp then check reports each kind of change', () => {
  const dir = mkdtempSync(join(tmpdir(), 'receipts-'));
  try {
    mkdirSync(join(dir, 'src'));
    for (const f of ['a', 'b', 'c']) writeFileSync(join(dir, 'src', f + '.js'), f);
    assert.match(run(dir, 'check', '.claude/reviews/x', 'src/a.js'), /^RECEIPT: NONE/);
    run(dir, 'stamp', '.claude/reviews/x', 'src/a.js', 'src/b.js', 'src/c.js');
    writeFileSync(join(dir, 'src', 'a.js'), 'a2');
    rmSync(join(dir, 'src', 'c.js'));
    writeFileSync(join(dir, 'src', 'd.js'), 'd');
    const out = run(dir, 'check', '.claude/reviews/x', 'src/b.js', 'src/d.js', 'src/never.js');
    assert.match(out, /^CHANGED src\/a\.js$/m);
    assert.match(out, /^UNCHANGED src\/b\.js$/m);
    assert.match(out, /^GONE src\/c\.js$/m);
    assert.match(out, /^NEW src\/d\.js$/m);
    assert.doesNotMatch(out, /never\.js/);
    writeFileSync(join(dir, '.review-run.tmp.txt'), 'src/b.js\n');
    assert.match(run(dir, 'check', '.claude/reviews/x', '--list', join(dir, '.review-run.tmp.txt')), /^UNCHANGED src\/b\.js$/m);
    assert.equal(existsSync(join(dir, '.review-run.tmp.txt')), false, 'temp list deleted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses a receipt dir outside .claude/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'receipts-'));
  try {
    assert.throws(() => run(dir, 'check', 'reviews/x'));
    assert.throws(() => run(dir, 'stamp', '.claude/../x', 'a'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stamps files outside the project and skips folders', () => {
  const outer = mkdtempSync(join(tmpdir(), 'receipts-'));
  const dir = join(outer, 'proj');
  try {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'a.js'), 'a');
    writeFileSync(join(outer, 'rule.md'), 'r');
    const out = run(dir, 'stamp', '.claude/reviews/x', 'src/a.js', join(outer, 'rule.md'), 'src');
    assert.match(out, /stamped 2 file/);
    assert.match(out, /^SKIPPED \(not a file\) src$/m);
    writeFileSync(join(outer, 'rule.md'), 'r2');
    assert.match(run(dir, 'check', '.claude/reviews/x', 'src'), /^CHANGED .*rule\.md$/m);
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
});
