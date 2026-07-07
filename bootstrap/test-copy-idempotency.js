#!/usr/bin/env node
'use strict';

// Executable regression test for the copy-mode (symlink-denied) fallback:
// copies must stay idempotent across upstream changes via the provenance
// manifest, while user-modified or unknown-provenance destinations still
// conflict and are never touched. Self-contained — runs against throwaway
// temp directories, never the real ~/.claude.
//
// Run: node bootstrap/test-copy-idempotency.js

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { linkItems } = require('./lib/link');
const { loadManifest, MANIFEST_NAME } = require('./lib/copy-manifest');
const { verifyAll } = require('./lib/verify');

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-idem-'));
  const repoRoot = path.join(root, 'repo');
  const homeClaude = path.join(root, 'home', '.claude');
  const src = path.join(repoRoot, 'skills');
  const dst = path.join(homeClaude, 'skills');
  write(path.join(src, 'notes.md'), 'notes v1\n');
  write(path.join(src, 'demo', 'SKILL.md'), 'demo alpha\n');
  write(path.join(src, 'demo', 'sub', 'deep.txt'), 'deep v1\n');
  return { root, repoRoot, homeClaude, src, dst };
}

function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function readManifest(homeClaude) {
  return JSON.parse(fs.readFileSync(path.join(homeClaude, MANIFEST_NAME), 'utf8'));
}

function actionsByName(results) {
  const map = {};
  for (const r of results) map[path.basename(r.dst)] = r.action;
  return map;
}

function cleanup(sb) {
  fs.rmSync(sb.root, { recursive: true, force: true });
}

const scenarios = [];
function scenario(name, fn) {
  scenarios.push({ name, fn });
}

scenario('(a) fresh copy records the manifest', () => {
  const sb = makeSandbox();
  try {
    const manifest = loadManifest(sb.homeClaude);
    const results = linkItems(sb.src, sb.dst, { manifest, forceCopy: true });
    for (const r of results) {
      assert.strictEqual(r.action, 'created', `${r.dst}: ${r.action}`);
      assert.strictEqual(r.mode, 'copy');
      assert.strictEqual(r.reason, 'copy-forced');
    }
    const written = readManifest(sb.homeClaude);
    assert.strictEqual(written.files['skills/notes.md'], sha256(path.join(sb.dst, 'notes.md')));
    assert.strictEqual(written.files['skills/demo/SKILL.md'], sha256(path.join(sb.dst, 'demo', 'SKILL.md')));
    assert.strictEqual(written.files['skills/demo/sub/deep.txt'], sha256(path.join(sb.dst, 'demo', 'sub', 'deep.txt')));
    assert.strictEqual(Object.keys(written.files).length, 3);
  } finally {
    cleanup(sb);
  }
});

scenario('(b) upstream edits refresh without conflict (size-changing + size-preserving)', () => {
  const sb = makeSandbox();
  try {
    linkItems(sb.src, sb.dst, { manifest: loadManifest(sb.homeClaude), forceCopy: true });

    // Upstream update: size-changing file edit, size-preserving dir-entry edit,
    // a deletion, and an addition.
    write(path.join(sb.src, 'notes.md'), 'notes v2 — grew longer\n');
    write(path.join(sb.src, 'demo', 'SKILL.md'), 'demo bravo\n'); // same byte length as 'demo alpha\n'
    fs.rmSync(path.join(sb.src, 'demo', 'sub', 'deep.txt'));
    write(path.join(sb.src, 'demo', 'added.txt'), 'brand new\n');

    const results = linkItems(sb.src, sb.dst, { manifest: loadManifest(sb.homeClaude), forceCopy: true });
    const actions = actionsByName(results);
    assert.strictEqual(actions['notes.md'], 'refreshed');
    assert.strictEqual(actions['demo'], 'refreshed');
    assert.ok(!results.some((r) => r.action === 'conflict'), 'no conflicts expected');

    assert.strictEqual(fs.readFileSync(path.join(sb.dst, 'notes.md'), 'utf8'), 'notes v2 — grew longer\n');
    assert.strictEqual(fs.readFileSync(path.join(sb.dst, 'demo', 'SKILL.md'), 'utf8'), 'demo bravo\n');
    assert.ok(!fs.existsSync(path.join(sb.dst, 'demo', 'sub', 'deep.txt')), 'upstream-deleted file removed from copy');
    assert.strictEqual(fs.readFileSync(path.join(sb.dst, 'demo', 'added.txt'), 'utf8'), 'brand new\n');

    const written = readManifest(sb.homeClaude);
    assert.strictEqual(written.files['skills/notes.md'], sha256(path.join(sb.src, 'notes.md')));
    assert.strictEqual(written.files['skills/demo/SKILL.md'], sha256(path.join(sb.src, 'demo', 'SKILL.md')));
    assert.strictEqual(written.files['skills/demo/sub/deep.txt'], undefined);
    assert.strictEqual(written.files['skills/demo/added.txt'], sha256(path.join(sb.src, 'demo', 'added.txt')));

    // Third run: everything settled.
    const again = linkItems(sb.src, sb.dst, { manifest: loadManifest(sb.homeClaude), forceCopy: true });
    for (const r of again) assert.strictEqual(r.action, 'up-to-date', `${r.dst}: ${r.action}`);
  } finally {
    cleanup(sb);
  }
});

scenario('(c) user-edited destination conflicts and stays untouched', () => {
  const sb = makeSandbox();
  try {
    linkItems(sb.src, sb.dst, { manifest: loadManifest(sb.homeClaude), forceCopy: true });
    const before = readManifest(sb.homeClaude);

    write(path.join(sb.dst, 'notes.md'), 'my personal notes\n');
    write(path.join(sb.dst, 'demo', 'SKILL.md'), 'demo alphA\n'); // size-preserving user edit

    const results = linkItems(sb.src, sb.dst, { manifest: loadManifest(sb.homeClaude), forceCopy: true });
    const actions = actionsByName(results);
    assert.strictEqual(actions['notes.md'], 'conflict');
    assert.strictEqual(actions['demo'], 'conflict');
    assert.strictEqual(fs.readFileSync(path.join(sb.dst, 'notes.md'), 'utf8'), 'my personal notes\n');
    assert.strictEqual(fs.readFileSync(path.join(sb.dst, 'demo', 'SKILL.md'), 'utf8'), 'demo alphA\n');
    assert.deepStrictEqual(readManifest(sb.homeClaude), before, 'conflict must not rewrite the manifest');
  } finally {
    cleanup(sb);
  }
});

scenario('(d) no manifest entry + differing content conflicts (pre-manifest install)', () => {
  const sb = makeSandbox();
  try {
    linkItems(sb.src, sb.dst, { forceCopy: true }); // install with no manifest
    write(path.join(sb.src, 'notes.md'), 'notes v2\n');
    write(path.join(sb.src, 'demo', 'SKILL.md'), 'demo bravo\n');

    const results = linkItems(sb.src, sb.dst, { manifest: loadManifest(sb.homeClaude), forceCopy: true });
    const actions = actionsByName(results);
    assert.strictEqual(actions['notes.md'], 'conflict');
    assert.strictEqual(actions['demo'], 'conflict');
    assert.strictEqual(fs.readFileSync(path.join(sb.dst, 'notes.md'), 'utf8'), 'notes v1\n');
    assert.strictEqual(fs.readFileSync(path.join(sb.dst, 'demo', 'SKILL.md'), 'utf8'), 'demo alpha\n');
  } finally {
    cleanup(sb);
  }
});

scenario('(migration) accurate pre-manifest copies are adopted, then refreshable', () => {
  const sb = makeSandbox();
  try {
    linkItems(sb.src, sb.dst, { forceCopy: true }); // install with no manifest

    // First manifest-aware run: destinations equal source → adopted.
    const results = linkItems(sb.src, sb.dst, { manifest: loadManifest(sb.homeClaude), forceCopy: true });
    for (const r of results) assert.strictEqual(r.action, 'up-to-date', `${r.dst}: ${r.action}`);
    assert.strictEqual(Object.keys(readManifest(sb.homeClaude).files).length, 3);

    // Now an upstream change refreshes instead of conflicting.
    write(path.join(sb.src, 'notes.md'), 'notes v2\n');
    const again = linkItems(sb.src, sb.dst, { manifest: loadManifest(sb.homeClaude), forceCopy: true });
    assert.strictEqual(actionsByName(again)['notes.md'], 'refreshed');
    assert.strictEqual(fs.readFileSync(path.join(sb.dst, 'notes.md'), 'utf8'), 'notes v2\n');
  } finally {
    cleanup(sb);
  }
});

scenario('(e) verify detects a size-preserving source change as stale copy', () => {
  const sb = makeSandbox();
  try {
    linkItems(sb.src, sb.dst, { manifest: loadManifest(sb.homeClaude), forceCopy: true });
    const subtrees = [{ name: 'skills', mode: 'items' }];

    let result = verifyAll({ repoRoot: sb.repoRoot, homeClaude: sb.homeClaude, subtrees });
    assert.strictEqual(result.clean, true, 'in-sync copy must verify clean');

    write(path.join(sb.src, 'demo', 'SKILL.md'), 'demo bravo\n'); // same size as 'demo alpha\n'
    result = verifyAll({ repoRoot: sb.repoRoot, homeClaude: sb.homeClaude, subtrees });
    assert.strictEqual(result.clean, false, 'size-preserving change must be visible');
    assert.strictEqual(result.stale, 1);
    const staleEntry = result.subtreeReports[0].stale[0];
    assert.strictEqual(staleEntry.name, 'demo');
    assert.ok(staleEntry.reason.includes('stale copy'), staleEntry.reason);

    // A user-modified copy is NOT stale — it must surface as not-linked.
    write(path.join(sb.dst, 'demo', 'SKILL.md'), 'demo bravo\n'); // now matches src but not the manifest…
    write(path.join(sb.dst, 'notes.md'), 'user edit\n');
    result = verifyAll({ repoRoot: sb.repoRoot, homeClaude: sb.homeClaude, subtrees });
    const report = result.subtreeReports[0];
    assert.ok(report.missing.some((m) => m.name === 'notes.md' && m.reason === 'not-linked'));
    assert.ok(!report.stale.some((s) => s.name === 'notes.md'));
  } finally {
    cleanup(sb);
  }
});

let failed = 0;
for (const { name, fn } of scenarios) {
  try {
    fn();
    console.log(`pass  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.message}`);
  }
}
console.log(failed === 0 ? `\nall ${scenarios.length} scenarios passed` : `\n${failed} of ${scenarios.length} scenarios FAILED`);
process.exit(failed === 0 ? 0 : 1);
