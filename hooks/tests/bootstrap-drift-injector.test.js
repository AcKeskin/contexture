'use strict';

// Runner for bootstrap-drift-injector. Payloads are documented-shape
// SessionStart events (source field; no matcher in the payload).
//
// The trigger case builds a fake home whose ~/.claude/claude-md link resolves
// into a fake repo carrying a stub bootstrap/lib/verify.js that reports drift,
// so the emit path runs without touching the real install.

const fs = require('fs');
const os = require('os');
const path = require('path');
const h = require('./harness');

const t = h.makeAsserter('bootstrap-drift-injector');

// Fake home with no claude-md link → repo root unresolvable → silent.
{
  const home = h.makeTempHome('cc-hooks-bdi-clean-');
  const r = h.runHook(
    'bootstrap-drift-injector',
    h.loadPayload('session-start.startup.json'),
    { home }
  );
  t.assert('unresolvable repo exits 0', r.exit === 0, 'exit ' + r.exit);
  t.assert('unresolvable repo is silent', r.stdout.trim() === '', 'stdout: ' + r.stdout);
}

// Fake home linked to a fake repo whose verify stub reports drift → warning.
{
  const home = h.makeTempHome('cc-hooks-bdi-drift-');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-hooks-bdi-repo-'));
  fs.mkdirSync(path.join(repo, 'claude-md'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'bootstrap', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'bootstrap', 'bootstrap.js'), '');
  fs.writeFileSync(
    path.join(repo, 'bootstrap', 'lib', 'verify.js'),
    "module.exports = { verifyAll() { return { clean: false, missing: 1, stale: 0, " +
      "subtreeReports: [{ subtree: 'skills', missing: [{ name: 'ghost', reason: 'missing link' }], stale: [] }] }; } };\n"
  );
  // 'junction' works without elevation on Windows; degrades to a dir symlink elsewhere.
  fs.symlinkSync(
    path.join(repo, 'claude-md'),
    path.join(home, '.claude', 'claude-md'),
    'junction'
  );

  const r = h.runHook(
    'bootstrap-drift-injector',
    h.loadPayload('session-start.startup.json'),
    { home }
  );
  t.assert('drift exits 0', r.exit === 0, 'exit ' + r.exit);
  const ctx = h.additionalContext(r.stdout, 'SessionStart');
  t.assert(
    'drift emits SessionStart additionalContext naming the drift',
    typeof ctx === 'string' && ctx.includes('Bootstrap drift') && ctx.includes('skills/ghost'),
    'stdout: ' + r.stdout
  );
}

t.report();
