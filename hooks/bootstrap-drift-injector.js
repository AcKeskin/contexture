#!/usr/bin/env node
'use strict';

// SessionStart hook: run bootstrap --verify and inject a one-line warning
// into the session context if drift is detected. Silent when clean.
//
// Drift surfaces include:
//   - Local-add drift: entry added to contexture/<subtree>/ but bootstrap
//     not re-run. Layer 3's post-pull git hook does not catch this.
//   - Pulled-without-bootstrap drift: machine-A pushed; machine-B pulled but
//     core.hooksPath wasn't set yet on machine-B (e.g. fresh clone before
//     first bootstrap). Layer 3 catches it on the second pull onward; this
//     catches it on the very next session in the meantime.
//   - Stale-link drift: file renamed/deleted in repo, ~/.claude/ symlink
//     dangling.

const path = require('path');
const fs = require('fs');
const io = require('./lib/hook-io');

const MATCHER_TARGETS = new Set(['startup', 'compact']);

async function main() {
  const payload = await io.readPayload();
  const matcher = payload.matcher || '';
  if (!MATCHER_TARGETS.has(matcher)) return io.allow();

  const repoRoot = locateRepoRoot();
  if (!repoRoot) return io.allow();

  const verify = safeRequire(path.join(repoRoot, 'bootstrap', 'lib', 'verify.js'));
  if (!verify) return io.allow();

  const subtrees = [
    { name: 'claude-md', mode: 'whole' },
    { name: 'architectural-rules', mode: 'whole' },
    { name: 'skills', mode: 'items' },
    { name: 'commands', mode: 'items' },
    { name: 'agents', mode: 'items' },
    { name: 'hooks', mode: 'items' },
  ];

  let result;
  try {
    result = verify.verifyAll({ repoRoot, homeClaude: io.homeClaude(), subtrees });
  } catch {
    return io.allow();
  }

  if (result.clean) return io.allow();

  const items = [];
  for (const r of result.subtreeReports) {
    for (const m of r.missing || []) items.push(`${r.subtree}/${m.name} (${m.reason})`);
    for (const s of r.stale || []) items.push(`${r.subtree}/${s.name} (stale)`);
  }
  const preview = items.slice(0, 5).join(', ');
  const suffix = items.length > 5 ? `, +${items.length - 5} more` : '';
  const message =
    `Bootstrap drift: ${result.missing} missing-link, ${result.stale} stale-link — ${preview}${suffix}. ` +
    `Run \`node ${path.join(repoRoot, 'bootstrap', 'bootstrap.js')}\` to fix.`;

  process.stdout.write(JSON.stringify({ context: message }) + '\n');
  io.allow();
}

function locateRepoRoot() {
  const home = io.homeClaude();
  for (const subtree of ['claude-md', 'architectural-rules']) {
    const linkPath = path.join(home, subtree);
    try {
      const real = fs.realpathSync(linkPath);
      const candidate = path.dirname(real);
      if (fs.existsSync(path.join(candidate, 'bootstrap', 'bootstrap.js'))) {
        return candidate;
      }
    } catch {
      // try next
    }
  }
  return null;
}

function safeRequire(p) {
  try {
    return require(p);
  } catch {
    return null;
  }
}

main().catch(() => io.allow());
