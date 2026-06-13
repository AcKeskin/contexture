#!/usr/bin/env node
'use strict';

// Bootstrap entry. Idempotent: safe to re-run. Per-machine install — clones
// have already happened; this wires contexture into ~/.claude/ and
// installs per-machine tools (CCometixLine).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { detect } = require('./lib/platform');
const { linkDir, linkItems, pruneOrphans } = require('./lib/link');
const { resolveSettings, writeSettings } = require('./lib/settings');
const { ensureInstalled: ensureCcline } = require('./lib/ccline');
const { verifyAll, formatReport, scanLeaks, formatLeakReport, planLeakFixes } = require('./lib/verify');
const { loadEnablement, excludeFor, isFilterable } = require('./lib/enablement');
const { makeBackupSession } = require('./lib/backup');
const { registerMcps, MCP_MANIFEST } = require('./lib/mcps');

// Subtree link mode.
//   'whole' — directory owned exclusively by contexture; link the whole dir.
//   'items' — shared namespace in ~/.claude/ where user or plugins may also
//             place content; link each entry individually so peers survive.
//   inRepoMirror — optional repo-relative dir that ALSO receives a per-item
//             mirror of this subtree (gitignored generated output). Used so
//             other coding agents (Copilot/Codex/Cursor/VS Code) auto-discover
//             skills from the in-repo `.claude/skills/` they natively scan,
//             without moving the committed source off repo-root `skills/`.
const SYNCED_SUBTREES = [
  { name: 'claude-md', mode: 'whole' },
  { name: 'architectural-rules', mode: 'whole' },
  { name: 'skills', mode: 'items', inRepoMirror: '.claude/skills' },
  { name: 'commands', mode: 'items' },
  { name: 'agents', mode: 'items' },
  { name: 'hooks', mode: 'items' },
];

async function main(argv) {
  const flags = parseFlags(argv);
  const repoRoot = path.resolve(__dirname, '..');
  const env = detect();

  log(`platform: ${env.platform}`);
  log(`repo:     ${repoRoot}`);
  log(`target:   ${env.homeClaude}`);
  if (flags.dryRun) log('mode:     dry-run (no changes written)');
  if (flags.verify) log('mode:     verify (read-only audit)');

  const excluded = new Set(flags.exclude);
  const subtrees = SYNCED_SUBTREES.filter((s) => !excluded.has(s.name));

  if (flags.verify) {
    const result = verifyAll({ repoRoot, homeClaude: env.homeClaude, subtrees });
    log(formatReport(result));
    // Share-readiness leak scan (proposal 055) — ADVISORY. Reported but never
    // changes the exit code; only link drift (above) is blocking.
    const extraTokens = loadShareReadinessTokens(env.homeClaude);
    const leaks = scanLeaks({ repoRoot, extraTokens });
    log(formatLeakReport(leaks));
    if (!result.clean) process.exitCode = 1;
    return;
  }

  if (flags.fixLeaks) {
    // Interactive share-readiness fix (proposal 055, step 4). Separate from the
    // read-only/CI-safe --verify path. Propose-confirm-commit per fixable leak;
    // ambiguous leaks are reported as report-only and never auto-touched.
    const extraTokens = loadShareReadinessTokens(env.homeClaude);
    const leaks = scanLeaks({ repoRoot, extraTokens });
    await runLeakFix(leaks);
    return;
  }

  // 0. Load enablement config (proposal 034a). Loud-fails on malformed JSON.
  // In dry-run, do not seed the file; show what would be loaded instead.
  let enablement;
  if (flags.dryRun) {
    log('hook-config: would load enabled block (and seed solo defaults if missing)');
    enablement = { enabled: require('./lib/enablement').DEFAULT_ENABLED, seeded: false, configPath: '<dry-run>' };
  } else {
    enablement = loadEnablement({ homeClaude: env.homeClaude });
    if (enablement.seeded) {
      log(`hook-config: seeded enabled block with solo defaults (edit ${enablement.configPath} to customize)`);
    }
  }

  // Backup session for any unlinks done during step 1 (lazy — directory only
  // created if at least one entry needs backing up).
  const backupSession = flags.dryRun ? null : makeBackupSession(env.homeClaude);

  // 1. Link synced subtrees that actually exist in the repo.
  for (const sub of subtrees) {
    const src = path.join(repoRoot, sub.name);
    const dst = path.join(env.homeClaude, sub.name);
    if (!fs.existsSync(src)) {
      log(`link ${sub.name}: skipped (not present in repo)`);
      continue;
    }
    if (flags.dryRun) {
      const shape = sub.mode === 'items' ? 'per-item' : 'whole-dir';
      log(`link ${sub.name}: would link ${shape} ${src} → ${dst}`);
      if (sub.mode === 'items') {
        pruneOrphans(src, dst, { dryRun: true }).forEach((p) =>
          log(`prune ${sub.name}: would remove orphan '${path.basename(p.dst)}'`)
        );
      }
      if (sub.inRepoMirror) {
        log(`mirror ${sub.name}: would link per-item ${src} → ${path.join(repoRoot, sub.inRepoMirror)}`);
        pruneOrphans(src, path.join(repoRoot, sub.inRepoMirror), { dryRun: true }).forEach((p) =>
          log(`prune ${sub.name} (mirror): would remove orphan '${path.basename(p.dst)}'`)
        );
      }
      continue;
    }
    if (sub.mode === 'items') {
      const exclude = excludeFor(enablement.enabled, sub.name);
      const filterable = isFilterable(sub.name);
      const linkSet = filterable ? listEntries(src).filter((n) => !exclude.includes(n)) : null;
      const results = linkItems(src, dst, { only: linkSet });
      const gcResults = filterable
        ? collectExcluded({ exclude, dst, backupSession, subtreeName: sub.name })
        : [];
      reportItems(`link ${sub.name}`, results.concat(gcResults));
      pruneOrphans(src, dst).forEach((p) =>
        log(`prune ${sub.name}: removed orphan '${path.basename(p.dst)}' (source renamed/deleted)`)
      );

      // In-repo mirror: also link each item into a gitignored repo-relative dir
      // so non-Claude agents discover the same (enablement-filtered) skill set.
      if (sub.inRepoMirror) {
        const mirrorDst = path.join(repoRoot, sub.inRepoMirror);
        const mirrorResults = linkItems(src, mirrorDst, { only: linkSet });
        const mirrorGc = filterable
          ? collectExcluded({ exclude, dst: mirrorDst, backupSession, subtreeName: `${sub.name} (mirror)` })
          : [];
        reportItems(`mirror ${sub.name}`, mirrorResults.concat(mirrorGc));
        pruneOrphans(src, mirrorDst).forEach((p) =>
          log(`prune ${sub.name} (mirror): removed orphan '${path.basename(p.dst)}'`)
        );
      }
    } else {
      const result = linkDir(src, dst);
      report(`link ${sub.name}`, result);
    }
  }
  if (backupSession && backupSession.wasUsed()) {
    log(`backup: created ${backupSession.root}`);
  }

  // 2. Install CCometixLine (per-machine). Skip if explicitly excluded.
  let cclineResult = { action: 'skipped', reason: 'excluded' };
  if (!excluded.has('ccline')) {
    if (flags.dryRun) {
      log(`ccline: would ensure installed at ${env.cclinePath}`);
    } else {
      cclineResult = ensureCcline({ cclinePath: env.cclinePath });
      report('ccline', cclineResult);
    }
  } else {
    log('ccline: skipped (excluded)');
  }

  // 3. Resolve and write settings.json.
  if (!flags.dryRun) {
    const settings = resolveSettings({
      repoRoot,
      cclinePathForSettings: env.cclinePathForSettings,
      homeDirForSettings: env.home.split(path.sep).join('/'),
      enabledHookBundles: enablement.enabled.hookBundles,
    });
    const settingsResult = writeSettings({ homeClaude: env.homeClaude, settings });
    const enabledBundleNames = Object.entries(enablement.enabled.hookBundles)
      .filter(([, on]) => on)
      .map(([name]) => name);
    log(`settings: ${settingsResult.action} (bundles enabled: ${enabledBundleNames.join(', ') || 'none'})`);
  } else {
    log('settings: would merge template + local and write to ~/.claude/settings.json');
  }

  // 4. Wire git core.hooksPath so .githooks/post-merge etc. fire on pulls.
  if (!flags.dryRun) {
    const hooksResult = wireGitHooksPath(repoRoot);
    report('githooks', hooksResult);
  } else {
    log('githooks: would set core.hooksPath=.githooks if unset or already pointing there');
  }

  // 5. Register repo-owned MCP servers into ~/.claude.json's mcpServers map.
  // Peer MCPs (claude.ai built-ins, third-party plugins like context7) are
  // left alone — we only touch entries our manifest names.
  if (!excluded.has('mcps')) {
    const mcpResult = registerMcps({ repoRoot, homeDir: env.home, dryRun: flags.dryRun });
    if (!mcpResult.ok) {
      report('mcps', { action: 'skipped', reason: mcpResult.reason });
    } else {
      const summary = summariseMcpResults(mcpResult.results);
      log(`mcps: ${mcpResult.action}${summary ? ` (${summary})` : ''}`);
      for (const r of mcpResult.results) {
        if (r.action.startsWith('skipped')) {
          log(`  - ${r.name}: ${r.action}`);
        }
      }
    }
  } else {
    log('mcps: skipped (excluded)');
  }

  log('done.');
}

function summariseMcpResults(results) {
  if (!results || results.length === 0) return '';
  const tally = {};
  for (const r of results) tally[r.action] = (tally[r.action] ?? 0) + 1;
  return Object.entries(tally)
    .map(([k, n]) => `${k}=${n}`)
    .join(', ');
}

function listEntries(srcDir) {
  if (!fs.existsSync(srcDir)) return [];
  return fs.readdirSync(srcDir);
}

function collectExcluded({ exclude, dst, backupSession, subtreeName }) {
  // For each entry in the user's exclude list, if it currently exists at dst,
  // back it up (or unlink the symlink) and report.
  const results = [];
  for (const name of exclude) {
    const target = path.join(dst, name);
    if (!fs.existsSync(target) && !fs.lstatSync(target, { throwIfNoEntry: false })) {
      // Already absent — common case after the user has been running with the
      // exclude in place for a while. Silent success.
      continue;
    }
    let lstat;
    try {
      lstat = fs.lstatSync(target);
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    const result = backupSession.backup(target, subtreeName, name);
    results.push({
      action: 'excluded',
      reason: result.action === 'unlinked' ? `${result.mode}` : result.reason || 'unlinked',
      dst: target,
      mode: result.mode,
    });
  }
  return results;
}

// Read the optional share-readiness extra-token list from hook-config.json
// (proposal 055). Lets a user declare owner-specific strings to flag (their
// name, a personal tool path) without hardcoding the owner into the checker.
// Absent / malformed config → empty list (the generic patterns still run).
function loadShareReadinessTokens(homeClaude) {
  const configPath = path.join(homeClaude, 'hook-config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const toks = cfg && cfg.shareReadiness && cfg.shareReadiness.extraTokens;
    return Array.isArray(toks) ? toks : [];
  } catch {
    return [];
  }
}

// Interactive propose-confirm-commit over the fixable leaks (proposal 055).
// Surfaces each fixable leak + its suggested action and asks before doing
// anything. Ambiguous (report-only) leaks are listed for manual triage.
// NOTE: the "commit" here surfaces and records the human action — the correct
// replacement (which config key, what fallback text) is context-specific, so
// this guides the fix rather than blindly rewriting prose. Nothing is written
// without an explicit per-leak "y".
async function runLeakFix(leakResult) {
  const { fixable, reportOnly } = planLeakFixes(leakResult);
  if (!fixable.length && !reportOnly.length) {
    console.log('fix-leaks: clean — no owner-coupling leaks found.');
    return;
  }
  if (reportOnly.length) {
    console.log(`fix-leaks: ${reportOnly.length} report-only leak(s) (ambiguous — fix by hand or annotate WONT_FIX):`);
    for (const f of reportOnly) console.log(`  • ${f.file}:${f.line} — ${f.category} — ${f.literal}`);
  }
  if (!fixable.length) {
    console.log('fix-leaks: no mechanically-fixable leaks.');
    return;
  }
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));
  let accepted = 0;
  try {
    for (const f of fixable) {
      console.log('');
      console.log(`  ${f.file}:${f.line} — ${f.category} — ${f.literal}`);
      console.log(`  proposed: ${f.suggestion}`);
      const ans = (await ask('  apply guidance? (y/N) ')).trim().toLowerCase();
      if (ans === 'y' || ans === 'yes') {
        accepted++;
        console.log('  → confirmed. Apply the replacement in the file, then re-run --verify to confirm clean.');
      } else {
        console.log('  → skipped.');
      }
    }
  } finally {
    rl.close();
  }
  console.log('');
  console.log(`fix-leaks: ${accepted} confirmed, ${fixable.length - accepted} skipped, ${reportOnly.length} report-only.`);
}

function wireGitHooksPath(repoRoot) {
  const desired = '.githooks';
  const hooksDir = path.join(repoRoot, desired);
  if (!fs.existsSync(hooksDir)) {
    return { action: 'skipped', reason: 'no-githooks-dir' };
  }
  let current = null;
  try {
    current = execFileSync('git', ['-C', repoRoot, 'config', '--local', '--get', 'core.hooksPath'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    current = null;
  }
  if (current === desired) {
    return { action: 'up-to-date', mode: `core.hooksPath=${desired}` };
  }
  if (current && current.length > 0) {
    return {
      action: 'skipped',
      reason: `core.hooksPath already set to "${current}" — leaving alone, post-pull auto-bootstrap disabled`,
    };
  }
  try {
    execFileSync('git', ['-C', repoRoot, 'config', '--local', 'core.hooksPath', desired], {
      stdio: 'ignore',
    });
    return { action: 'created', mode: `core.hooksPath=${desired}` };
  } catch (err) {
    return { action: 'skipped', reason: `git config failed: ${err.message}` };
  }
}

function parseFlags(argv) {
  const flags = { exclude: [], dryRun: false, verify: false, fixLeaks: false };
  for (const a of argv) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verify') flags.verify = true;
    else if (a === '--fix-leaks') flags.fixLeaks = true;
    else if (a.startsWith('--exclude=')) {
      flags.exclude = a.slice('--exclude='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`unknown flag: ${a}`);
      printHelp();
      process.exit(2);
    }
  }
  return flags;
}

function printHelp() {
  const excludable = SYNCED_SUBTREES.map((s) => s.name).concat(['ccline', 'mcps']).join(', ');
  console.log(
    `Usage: node bootstrap/bootstrap.js [--dry-run] [--verify] [--fix-leaks] [--exclude=<list>]\n\n` +
      `  --verify     audit ~/.claude/ for missing or stale links; exits 1 on drift.\n` +
      `               read-only — does not write. Also runs an advisory share-readiness\n` +
      `               leak scan (non-blocking; never changes the exit code).\n` +
      `  --fix-leaks  interactive: re-scan for owner-coupling leaks and propose a fix\n` +
      `               per mechanically-fixable finding (propose-confirm-commit).\n\n` +
      `Excludable: ${excludable}\n`
  );
}

function report(label, result) {
  const parts = [`${label}:`, result.action];
  if (result.mode) parts.push(`(${result.mode})`);
  if (result.reason) parts.push(`— ${result.reason}`);
  log(parts.join(' '));
  if (result.action === 'conflict') {
    process.exitCode = 1;
  }
}

function reportItems(label, results) {
  if (results.length === 0) {
    log(`${label}: up-to-date (empty)`);
    return;
  }
  const tally = { created: 0, 'up-to-date': 0, conflict: 0, skipped: 0, excluded: 0 };
  for (const r of results) tally[r.action] = (tally[r.action] ?? 0) + 1;
  const summary = Object.entries(tally)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}=${n}`)
    .join(', ');
  log(`${label}: ${summary}`);
  for (const r of results) {
    if (r.action === 'conflict') {
      log(`  conflict: ${path.basename(r.dst)} — ${r.reason}`);
      process.exitCode = 1;
    } else if (r.action === 'created') {
      log(`  + ${path.basename(r.dst)} (${r.mode})`);
    } else if (r.action === 'excluded') {
      log(`  - ${path.basename(r.dst)} (${r.reason})`);
    }
  }
}

function log(msg) {
  process.stdout.write(msg + '\n');
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`bootstrap failed: ${err.message}`);
  process.exit(1);
});
