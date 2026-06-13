#!/usr/bin/env node
'use strict';

// Clean-clone test (proposal 055, step 5).
//
// Proves a fresh peer fork installs cleanly: copies the repo to a throwaway
// temp dir, points bootstrap at a throwaway HOME (so os.homedir() resolves to
// a fake ~/.claude with NO owner settings.local / hook-config present), runs
// bootstrap then `bootstrap --verify`, and reports pass/fail of what a brand-new
// user would actually get.
//
// Idempotent. Touches neither the real ~/.claude nor the real repo — all work
// happens under an OS temp dir that is removed on exit.
//
// Usage:  node scripts/clean-clone-test.js [--keep]
//   --keep   leave the temp dirs in place for inspection (default: clean up)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const KEEP = process.argv.includes('--keep');

// Directories NOT to copy into the throwaway clone — heavy / irrelevant / local.
const SKIP_COPY = new Set(['.git', 'node_modules', '.worktrees']);

function log(msg) {
  console.log(`[clean-clone] ${msg}`);
}

function mkdtemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Recursive copy honoring SKIP_COPY at any depth. No symlink following.
function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_COPY.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyTree(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
    // Skip symlinks and special files — a fresh clone has none that matter here.
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function snapshot(p) {
  // Cheap fingerprint of a directory tree's shape for the untouched-assertion.
  if (!fs.existsSync(p)) return 'ABSENT';
  const acc = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        acc.push('D ' + path.relative(p, full));
        walk(full);
      } else {
        let size = 0;
        try { size = fs.statSync(full).size; } catch { /* ignore */ }
        acc.push('F ' + path.relative(p, full) + ' ' + size);
      }
    }
  };
  walk(p);
  return acc.join('\n');
}

function main() {
  const cloneDir = mkdtemp('cc-repo-');
  const fakeHome = mkdtemp('cc-home-');
  const realHome = os.homedir();
  const realClaudeSnap = snapshot(path.join(realHome, '.claude'));

  let pass = false;
  let failReason = null;

  try {
    log(`repo:       ${REPO_ROOT}`);
    log(`clone:      ${cloneDir}`);
    log(`fake HOME:  ${fakeHome}`);

    // 1. Copy the repo into the throwaway clone (no .git / node_modules).
    copyTree(REPO_ROOT, cloneDir);

    // Confirm no owner-local override leaked into the clone.
    const localSettings = path.join(cloneDir, 'settings', 'settings.local.json');
    if (fs.existsSync(localSettings)) {
      // settings.local.json is gitignored; a real clone never has it. If the
      // working tree carried one, remove it from the clone so the test reflects
      // a true fresh clone.
      fs.rmSync(localSettings, { force: true });
      log('note: removed a stray settings.local.json from the clone (a real fork never ships it)');
    }

    // 2. Run bootstrap against the fake HOME.
    const env = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome };
    const bootstrap = path.join(cloneDir, 'bootstrap', 'bootstrap.js');

    log('running bootstrap...');
    execFileSync('node', [bootstrap], { env, stdio: 'inherit' });

    // 3. Run --verify against the fake HOME; capture output + exit code.
    log('running bootstrap --verify...');
    let verifyOut = '';
    let verifyExit = 0;
    try {
      verifyOut = execFileSync('node', [bootstrap, '--verify'], { env, encoding: 'utf8' });
    } catch (err) {
      verifyExit = err.status == null ? 1 : err.status;
      verifyOut = (err.stdout || '') + (err.stderr || '');
    }
    process.stdout.write(verifyOut);

    // 4. Assert: link verify clean (exit 0) AND leak scan clean.
    const linkClean = verifyExit === 0 && /verify: clean/.test(verifyOut);
    const leakClean = /share-readiness: clean/.test(verifyOut);

    if (!linkClean) failReason = `link verify not clean (exit ${verifyExit})`;
    else if (!leakClean) failReason = 'share-readiness leak scan reported leaks';
    else pass = true;
  } catch (err) {
    failReason = `bootstrap threw: ${err.message}`;
  } finally {
    // 5. Assert the real ~/.claude was untouched.
    const realClaudeSnapAfter = snapshot(path.join(realHome, '.claude'));
    if (realClaudeSnap !== realClaudeSnapAfter) {
      pass = false;
      failReason = (failReason ? failReason + '; ' : '') + 'real ~/.claude was modified (side effect — bug)';
    }

    if (KEEP) {
      log(`kept: ${cloneDir}, ${fakeHome}`);
    } else {
      rmrf(cloneDir);
      rmrf(fakeHome);
    }
  }

  console.log('');
  if (pass) {
    log('PASS — a fresh clone installs clean against a fake HOME, real ~/.claude untouched.');
    process.exit(0);
  } else {
    log(`FAIL — ${failReason}`);
    process.exit(1);
  }
}

main();
