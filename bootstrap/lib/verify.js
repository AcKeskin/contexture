'use strict';

// Verify: read-only audit that the repo's synced subtrees and their entries
// are wired into ~/.claude/. Three drift modes:
//   missing-link — entry exists in repo, no link/copy in ~/.claude/<subtree>/
//   stale-link   — a dst entry whose name is still in the repo set but whose
//                  link/copy diverged from the source (re-link fixes it)
//   orphan       — a dangling symlink into the repo whose target was renamed or
//                  deleted. ADVISORY / non-blocking: a plain
//                  bootstrap run self-heals it via link.js's pruneOrphans, so
//                  it never fails the exit code — `--verify` only surfaces it,
//                  answering 072 open-question 2.
//
// Mirrors link.js's two modes (whole-dir vs per-item) and its symlink/copy
// fallback. The ~/.claude/ entry is "linked" if it's either:
//   - a symlink whose absolute target equals the repo path, OR
//   - a regular file/dir whose contents equal the repo path's contents (the
//     fallback path link.js takes when symlinks are denied on Windows).

const fs = require('fs');
const path = require('path');

function verifyAll({ repoRoot, homeClaude, subtrees }) {
  const subtreeReports = [];
  for (const sub of subtrees) {
    const src = path.join(repoRoot, sub.name);
    const dst = path.join(homeClaude, sub.name);
    if (!fs.existsSync(src)) {
      subtreeReports.push({ subtree: sub.name, status: 'skipped', reason: 'source-missing' });
      continue;
    }
    if (sub.mode === 'whole') {
      subtreeReports.push(verifyWhole(sub.name, src, dst));
    } else {
      subtreeReports.push(verifyItems(sub.name, src, dst));
    }

    // In-repo mirror (e.g. .claude/skills/) — the generated cross-tool
    // discovery copy. Same per-item drift check, against the repo-relative dst.
    if (sub.inRepoMirror) {
      const mirrorDst = path.join(repoRoot, sub.inRepoMirror);
      subtreeReports.push(verifyItems(`${sub.name} (mirror)`, src, mirrorDst));
    }
  }

  let missing = 0;
  let stale = 0;
  let orphans = 0;
  for (const r of subtreeReports) {
    if (r.missing) missing += r.missing.length;
    if (r.stale) stale += r.stale.length;
    if (r.orphans) orphans += r.orphans.length;
  }

  // Orphans are advisory only: a plain bootstrap prunes them automatically, so
  // they never enter the `clean` (blocking) verdict — only missing/stale do.
  return { subtreeReports, missing, stale, orphans, clean: missing === 0 && stale === 0 };
}

function verifyWhole(name, src, dst) {
  const existing = safeLstat(dst);
  if (!existing) {
    return { subtree: name, mode: 'whole', status: 'drift', missing: [{ name, dst, reason: 'not-present' }], stale: [] };
  }
  if (linksTo(dst, existing, src)) {
    return { subtree: name, mode: 'whole', status: 'ok' };
  }
  return {
    subtree: name,
    mode: 'whole',
    status: 'drift',
    missing: [{ name, dst, reason: 'not-linked' }],
    stale: [],
  };
}

function verifyItems(name, srcDir, dstDir) {
  const missing = [];
  const stale = [];
  const orphans = [];
  let okCount = 0;

  if (!fs.existsSync(dstDir)) {
    const repoEntries = fs.readdirSync(srcDir);
    for (const entryName of repoEntries) {
      missing.push({ name: entryName, dst: path.join(dstDir, entryName), reason: 'parent-dir-missing' });
    }
    return { subtree: name, mode: 'items', status: 'drift', missing, stale, orphans };
  }

  const repoEntries = new Set(fs.readdirSync(srcDir));
  for (const entryName of repoEntries) {
    const itemSrc = path.join(srcDir, entryName);
    const itemDst = path.join(dstDir, entryName);
    const existing = safeLstat(itemDst);
    if (!existing) {
      missing.push({ name: entryName, dst: itemDst, reason: 'not-present' });
      continue;
    }
    if (linksTo(itemDst, existing, itemSrc)) {
      okCount += 1;
    } else {
      missing.push({ name: entryName, dst: itemDst, reason: 'not-linked' });
    }
  }

  // Dangling symlinks into the repo whose target was renamed/deleted: these are
  // ORPHANS, the exact set link.js's pruneOrphans removes on a
  // plain run. Same safety as pruneOrphans — only a symlink whose resolved
  // target was directly inside srcDir counts; real files/dirs/copies (which may
  // be user or third-party content in this shared namespace) are never flagged.
  for (const entryName of fs.readdirSync(dstDir)) {
    if (repoEntries.has(entryName)) continue;
    const itemDst = path.join(dstDir, entryName);
    const existing = safeLstat(itemDst);
    if (!existing || !existing.isSymbolicLink()) continue;
    const target = safeReadlink(itemDst);
    if (!target) continue;
    const absTarget = path.resolve(path.dirname(itemDst), target);
    if (!isInside(absTarget, srcDir)) continue;
    if (!fs.existsSync(absTarget)) {
      orphans.push({ name: entryName, dst: itemDst, target: absTarget, reason: 'source-renamed-or-deleted' });
    }
  }

  // Orphans don't make a subtree 'drift' — they're advisory and self-healing.
  return {
    subtree: name,
    mode: 'items',
    status: missing.length === 0 && stale.length === 0 ? 'ok' : 'drift',
    okCount,
    missing,
    stale,
    orphans,
  };
}

function linksTo(dst, lstat, expectedSrc) {
  if (lstat.isSymbolicLink()) {
    const target = safeReadlink(dst);
    if (!target) return false;
    return path.resolve(path.dirname(dst), target) === path.resolve(expectedSrc);
  }
  if (lstat.isDirectory() && fs.existsSync(expectedSrc) && fs.statSync(expectedSrc).isDirectory()) {
    return directoriesEqual(expectedSrc, dst);
  }
  if (lstat.isFile() && fs.existsSync(expectedSrc) && fs.statSync(expectedSrc).isFile()) {
    return filesEqual(expectedSrc, dst);
  }
  return false;
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function safeLstat(p) {
  try {
    return fs.lstatSync(p);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function safeReadlink(p) {
  try {
    return fs.readlinkSync(p);
  } catch {
    return null;
  }
}

function directoriesEqual(a, b) {
  const listA = fs.readdirSync(a).sort();
  const listB = fs.readdirSync(b).sort();
  if (listA.length !== listB.length) return false;
  for (let i = 0; i < listA.length; i++) {
    if (listA[i] !== listB[i]) return false;
    const sa = fs.statSync(path.join(a, listA[i]));
    const sb = fs.statSync(path.join(b, listB[i]));
    if (sa.isDirectory() !== sb.isDirectory()) return false;
    if (sa.isDirectory()) {
      if (!directoriesEqual(path.join(a, listA[i]), path.join(b, listB[i]))) return false;
    } else if (sa.size !== sb.size) {
      return false;
    }
  }
  return true;
}

function filesEqual(a, b) {
  const sa = fs.statSync(a);
  const sb = fs.statSync(b);
  if (sa.size !== sb.size) return false;
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

// --- Share-readiness leak scan -------------------------------
//
// Advisory grep over linked authoring artefacts for owner-coupling leaks —
// machine paths, owner identity, owner-specific tool assumptions. NON-BLOCKING:
// findings are reported but never change the process exit code. A user's own
// app code legitimately contains their paths/identity; this scans only the
// harness-authoring surfaces that ship to a peer.

// Surfaces scanned (relative to repoRoot). Settings *.template.json are scanned;
// settings.local.json is excluded (gitignored, owner-personal by design).
// architectural-rules/ is deliberately NOT scanned: rules about path/identity
// leaks must show example paths as documentation — scanning the rule that
// defines the discipline would flag its own teaching examples. Per-line
// WONT_FIX annotations cover illustrative examples elsewhere.
const LEAK_SCAN_DIRS = ['skills', 'agents', 'commands', 'claude-md', 'mcps', 'docs'];

// Paths/files excluded from the scan: gitignored personal config, the plugin
// manifest (author metadata is legitimately the owner's), and any line carrying
// an explicit `share-readiness: WONT_FIX` annotation.
const LEAK_EXCLUDE_SUBSTRINGS = ['settings.local.json', '.claude-plugin/plugin.json', 'node_modules', '.git', 'build', 'dist', '_implementing'];
const LEAK_WONT_FIX_MARKER = 'share-readiness: WONT_FIX';

function leakPatterns(extraTokens) {
  const patterns = [
    { category: 'path', re: /[A-Za-z]:[\\/](?:Users|Personal)[\\/][^\s"'`)\]]+/g },
    { category: 'path', re: /\/(?:Users|home)\/[A-Za-z0-9._-]+\/[^\s"'`)\]]+/g },
    { category: 'identity', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  ];
  // Owner-specific strings to flag (e.g. a private companion-repo name) are
  // declared via shareReadiness.extraTokens — never hardcoded here, so a fresh
  // public fork ships clean. A token matches anywhere (bare mentions and links),
  // which is strictly more thorough than a relative-link-only cross-repo pattern.
  for (const tok of extraTokens || []) {
    if (!tok) continue;
    // Escape regex metacharacters in the user-declared token.
    const esc = String(tok).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patterns.push({ category: 'token', re: new RegExp(esc, 'g') });
  }
  return patterns;
}

function listFilesRecursive(dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (LEAK_EXCLUDE_SUBSTRINGS.some((s) => full.includes(s))) continue;
    if (e.isDirectory()) {
      listFilesRecursive(full, acc);
    } else if (e.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}

// scanLeaks({ repoRoot, extraTokens }) → { findings: [{file, line, category, literal}], scanned }
// Advisory only. Caller must NOT alter exit code based on the result.
function scanLeaks({ repoRoot, extraTokens }) {
  const patterns = leakPatterns(extraTokens);
  const findings = [];
  let scanned = 0;
  for (const d of LEAK_SCAN_DIRS) {
    const root = path.join(repoRoot, d);
    if (!fs.existsSync(root)) continue;
    for (const file of listFilesRecursive(root, [])) {
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      scanned++;
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        if (lineText.includes(LEAK_WONT_FIX_MARKER)) continue;
        for (const { category, re } of patterns) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(lineText)) !== null) {
            findings.push({
              file: path.relative(repoRoot, file),
              line: i + 1,
              category,
              literal: m[0],
            });
            if (m.index === re.lastIndex) re.lastIndex++; // guard zero-width
          }
        }
      }
    }
  }
  return { findings, scanned };
}

// Classify a leak finding's fixability.
// Only mechanically-unambiguous leaks get an auto-fix proposal; ambiguous ones
// (owner-specific tool assumptions) are report-only. Returns null when not
// auto-fixable, else { suggestion } describing the proposed replacement.
// (The finding already carries `category`; no separate `kind` is needed.)
function classifyFix(finding) {
  if (finding.category === 'path') {
    // A machine path → suggest reading from config (vaultRoot or a named key).
    return {
      suggestion: 'replace the literal path with a config read (e.g. vaultRoot from ~/.claude/hook-config.json) + a "configure me" fallback',
    };
  }
  if (finding.category === 'identity') {
    return {
      suggestion: 'replace the identity literal with a placeholder resolved at runtime (e.g. `git config user.name`)',
    };
  }
  // category 'token' = user-declared owner-specific string; report-only.
  return null;
}

// Build the fix plan: each fixable finding paired with its suggestion.
// Auto-fix here is ADVISORY-SUGGESTION ONLY — it proposes the human action;
// it does not rewrite code blindly, because the correct replacement (which
// config key, what fallback text) is context-specific. The caller drives the
// propose-confirm loop; "commit" means the user accepts the guidance and the
// caller marks it, not that a literal byte-substitution is applied.
function planLeakFixes(leakResult) {
  const fixable = [];
  const reportOnly = [];
  for (const f of leakResult.findings) {
    const fix = classifyFix(f);
    if (fix) fixable.push({ ...f, ...fix });
    else reportOnly.push(f);
  }
  return { fixable, reportOnly };
}

function formatLeakReport(leakResult) {
  const lines = [];
  lines.push('');
  lines.push(`share-readiness: scanned ${leakResult.scanned} authoring file(s)`);
  if (!leakResult.findings.length) {
    lines.push('share-readiness: clean — no owner-coupling leaks found');
    return lines.join('\n');
  }
  lines.push(`share-readiness: ADVISORY — ${leakResult.findings.length} possible leak(s) (non-blocking; exit code unchanged):`);
  for (const f of leakResult.findings) {
    lines.push(`  ⚠ ${f.file}:${f.line} — ${f.category} — ${f.literal}`);
  }
  lines.push('  (fix by reading from config, or annotate an intentional line with "share-readiness: WONT_FIX — <reason>")');
  return lines.join('\n');
}

function formatReport(verifyResult) {
  const lines = [];
  for (const r of verifyResult.subtreeReports) {
    if (r.status === 'skipped') {
      lines.push(`verify ${r.subtree}: skipped (${r.reason})`);
      continue;
    }
    if (r.status === 'ok') {
      if (r.mode === 'whole') {
        lines.push(`verify ${r.subtree}: ok (whole-dir)`);
      } else {
        lines.push(`verify ${r.subtree}: ok (${r.okCount} entries linked)`);
      }
    } else {
      const counts = [];
      if (r.missing && r.missing.length) counts.push(`${r.missing.length} missing-link`);
      if (r.stale && r.stale.length) counts.push(`${r.stale.length} stale-link`);
      lines.push(`verify ${r.subtree}: drift — ${counts.join(', ')}`);
      for (const m of r.missing || []) {
        lines.push(`  ! ${m.name} (${m.reason})`);
      }
      for (const s of r.stale || []) {
        lines.push(`  ~ ${s.name} → ${s.target} (${s.reason})`);
      }
    }
    // Orphans print regardless of ok/drift status — they're advisory and a
    // subtree can carry orphans while otherwise being fully linked (status ok).
    for (const o of r.orphans || []) {
      lines.push(`  ⓘ orphan: ${o.name} → ${o.target} (${o.reason}; a plain bootstrap prunes it)`);
    }
  }
  if (verifyResult.clean) {
    lines.push('verify: clean');
  } else {
    lines.push(`verify: drift — ${verifyResult.missing} missing-link, ${verifyResult.stale} stale-link`);
  }
  if (verifyResult.orphans) {
    lines.push(`verify: ${verifyResult.orphans} orphan(s) (advisory — self-healed on the next bootstrap; exit code unchanged)`);
  }
  return lines.join('\n');
}

// --- Instruction-glob drift check ----------------------------
// The `rulePrime.instructions` glob-array (hook-config.json) names extra
// instruction files for the prime hook to load. A glob that matches NOTHING is
// almost always a typo or a stale path — surface it. ADVISORY: reported, never
// alters the exit code (the 055 scanLeaks discipline). Reads the declaration
// from the home hook-config.json; expands each glob against repoRoot via the
// hook's own expander so the check and the runtime agree on semantics.
function verifyInstructionGlobs({ repoRoot, homeClaude }) {
  const findings = [];
  let patterns = [];
  try {
    const cfgPath = path.join(homeClaude, 'hook-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const rp = cfg && cfg.rulePrime;
      if (rp && Array.isArray(rp.instructions)) patterns = rp.instructions;
    }
  } catch {
    return { findings: [], checked: 0 }; // unreadable config → nothing to check
  }
  if (!patterns.length) return { findings: [], checked: 0 };

  let expandOne;
  try {
    ({ expandOne } = require(path.join(repoRoot, 'hooks', 'lib', 'glob-files')));
  } catch {
    return { findings: [], checked: patterns.length }; // expander absent → skip
  }
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || !pattern.trim()) continue;
    let matched = 0;
    try {
      matched = expandOne(pattern, repoRoot).length;
    } catch {
      matched = 0;
    }
    if (matched === 0) findings.push({ glob: pattern, matched: 0 });
  }
  return { findings, checked: patterns.length };
}

function formatInstructionGlobReport(globResult) {
  if (!globResult.checked) return ''; // nothing declared → silent (off-by-default)
  const lines = [''];
  if (!globResult.findings.length) {
    lines.push(`instruction-globs: ${globResult.checked} declared glob(s) all match — ok`);
    return lines.join('\n');
  }
  lines.push(
    `instruction-globs: ADVISORY — ${globResult.findings.length} of ${globResult.checked} declared glob(s) match nothing (non-blocking; exit code unchanged):`
  );
  for (const f of globResult.findings) {
    lines.push(`  ⚠ "${f.glob}" matched 0 files — likely a typo or stale path`);
  }
  lines.push('  (fix the pattern in hook-config.json rulePrime.instructions, or remove it)');
  return lines.join('\n');
}

module.exports = {
  verifyAll,
  formatReport,
  scanLeaks,
  formatLeakReport,
  classifyFix,
  verifyInstructionGlobs,
  formatInstructionGlobReport,
  planLeakFixes,
};
