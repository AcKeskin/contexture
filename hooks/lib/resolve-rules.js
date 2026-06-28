'use strict';

// Hook-callable implementation of the architectural-rule overlay
// resolver. This is the single Node entry point that turns the layered tier
// tree (shipped < company < user < project) into resolved, patched,
// anchor-stripped rule bodies — the same bytes `/prep` would render, delivered
// by a trigger (the rule-prime hook) instead of by a model turn.
//
// Why this lives here and not in the discover skill: a skill is model-driven
// prose, not callable code. The 047 algorithm was specified in
// docs/architectural-rules-overlay.md but never implemented as a subroutine.
// 077's hook needs to *call* it on the critical path, so it is implemented
// once here and consumed by the hook. Future MCP / agent-side callers
// reuse this module rather than re-deriving the algorithm.
//
// Algorithm (docs/architectural-rules-overlay.md § Resolution):
//   1. Read manifests: user, then project (most-local wins). Merge disables.
//   2. Enumerate <scope>/<name> rule keys across enabled tiers, low → high.
//   3. Resolve each key, highest tier down:
//        replace / no override:  → keep the highest-tier file.
//        mode: patch             → load lower body, apply remove/replace/add by
//                                  anchor id; orphaned anchor → base un-patched,
//                                  flagged.
//   4. Drop keys disabled at any scope.
//   5. Strip <!-- id: ... --> anchors from every resolved body.
//   6. Annotate ONLY non-default rules (overridden / patched / disabled-elsewhere).
//
// Fail-open contract (matches hooks/lib/hook-io.js): any I/O or parse error
// degrades to "fewer rules" or "shipped-only", never throws to the caller.
// A hook that crashes resolution must never break the turn.

const fs = require('fs');
const os = require('os');
const path = require('path');

// --- Tier definitions -------------------------------------------------------
// Precedence low → high. Higher tiers win a <scope>/<name> key.
// `home` tiers resolve under ~/.claude; the project tier is per-cwd.

const TIER_SHIPPED = 'shipped';
const TIER_COMPANY = 'company';
const TIER_USER = 'user';
const TIER_PROJECT = 'project';

// Ordered low → high so a later entry shadows an earlier one.
const TIER_ORDER = [TIER_SHIPPED, TIER_COMPANY, TIER_USER, TIER_PROJECT];

function homeClaude() {
  return path.join(os.homedir(), '.claude');
}

// Absolute directory for a tier, or null when the tier has no on-disk home in
// this environment (e.g. project tier resolved against a cwd with no .claude).
function tierDir(tier, cwd) {
  const home = homeClaude();
  switch (tier) {
    case TIER_SHIPPED:
      return path.join(home, 'architectural-rules');
    case TIER_COMPANY:
      return path.join(home, 'architectural-rules-company');
    case TIER_USER:
      return path.join(home, 'architectural-rules-local');
    case TIER_PROJECT:
      return cwd ? path.join(cwd, '.claude', 'rules') : null;
    default:
      return null;
  }
}

// --- Minimal YAML (manifest subset only) ------------------------------------
// The project ships zero npm dependencies (every bootstrap lib is plain
// fs/path/os), so we cannot require('js-yaml'). The manifest shape is small and
// fixed — see architectural-rules.config.example.yaml. We parse only what the
// resolver needs: top-level `disabled:` list, `tiers:` toggles, and the
// presence of a `company:` block. Anything we don't understand is ignored,
// which is the fail-open posture: an unparseable manifest line never aborts.

function parseManifest(text) {
  const out = { disabled: [], tiers: {} };
  if (!text) return out;
  const lines = text.split(/\r?\n/);
  let section = null; // null | 'disabled' | 'tiers'
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, ''); // strip trailing comments
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;

    if (indent === 0) {
      // Top-level key. Determine which (if any) block we're entering.
      const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (!m) {
        section = null;
        continue;
      }
      const key = m[1];
      if (key === 'disabled') section = 'disabled';
      else if (key === 'tiers') section = 'tiers';
      else section = null;
      continue;
    }

    // Indented line belongs to the current section.
    if (section === 'disabled') {
      const m = line.match(/^\s*-\s*(.+?)\s*$/);
      if (m) out.disabled.push(stripQuotes(m[1]));
    } else if (section === 'tiers') {
      const m = line.match(/^\s*([A-Za-z_][\w-]*):\s*(true|false)\s*$/i);
      if (m) out.tiers[m[1]] = /^true$/i.test(m[2]);
    }
  }
  return out;
}

function stripQuotes(s) {
  const t = String(s).trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function readManifestAt(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return parseManifest(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// Read user + project manifests and merge. Most-local (project) wins for tier
// toggles; disabled sets union (a rule disabled at either scope is off).
function loadManifests(cwd) {
  const user = readManifestAt(path.join(homeClaude(), 'architectural-rules.config.yaml')) || {
    disabled: [],
    tiers: {},
  };
  const project =
    (cwd && readManifestAt(path.join(cwd, '.claude', 'rules.config.yaml'))) || {
      disabled: [],
      tiers: {},
    };
  const disabled = new Set([...(user.disabled || []), ...(project.disabled || [])]);
  // Project tier toggles override user toggles where present.
  const tiers = Object.assign({}, user.tiers, project.tiers);
  return { disabled, tiers };
}

// A tier is enabled unless a manifest explicitly turned it off. Shipped and
// project are always enabled (they are not optional add-ons); company and user
// honour the `tiers:` toggle.
function tierEnabled(tier, tiers) {
  if (tier === TIER_SHIPPED || tier === TIER_PROJECT) return true;
  // Default-on: only an explicit `false` disables.
  return tiers[tier] !== false;
}

// --- Frontmatter ------------------------------------------------------------
// Rule files are <scope>/<name>.md with a YAML frontmatter block delimited by
// `---`. We need a handful of fields (name, scope, relevance, override, mode)
// for resolution and downstream scope/relevance gating. We parse the block
// generously and return { fm, body }.

function splitFrontmatter(text) {
  if (!text.startsWith('---')) return { fm: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { fm: {}, body: text };
  const fmText = text.slice(3, end).replace(/^\r?\n/, '');
  const afterIdx = text.indexOf('\n', end + 1);
  const body = afterIdx === -1 ? '' : text.slice(afterIdx + 1);
  return { fm: parseFrontmatter(fmText), body };
}

// Parse the subset of frontmatter the resolver uses. Scalars and flow-style
// lists (`scope: [a, b]`) are supported; nested structures (relations:) are
// captured shallowly as raw text and otherwise ignored.
function parseFrontmatter(text) {
  const fm = {};
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (/^\s/.test(line)) continue; // skip nested/indented lines (e.g. relations:)
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (val === '') {
      fm[key] = '';
      continue;
    }
    if (val.startsWith('[') && val.endsWith(']')) {
      fm[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => stripQuotes(s))
        .filter(Boolean);
    } else {
      fm[key] = stripQuotes(val);
    }
  }
  return fm;
}

// --- Enumeration ------------------------------------------------------------
// Walk a tier directory and return a map of <scope>/<name> → absolute path.
// Scope is the immediate subfolder; name is the file stem. Files directly under
// the tier root (no scope folder) are keyed by name alone — defensive, the
// shipped tree always uses scope folders.

function enumerateTier(dir) {
  const out = new Map();
  let scopes;
  try {
    if (!dir || !fs.existsSync(dir)) return out;
    scopes = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const scopeEnt of scopes) {
    if (scopeEnt.name.startsWith('.')) continue;
    const scopePath = path.join(dir, scopeEnt.name);
    if (scopeEnt.isDirectory()) {
      let files;
      try {
        files = fs.readdirSync(scopePath, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const f of files) {
        if (f.isFile() && f.name.endsWith('.md')) {
          const key = `${scopeEnt.name}/${f.name.replace(/\.md$/, '')}`;
          out.set(key, path.join(scopePath, f.name));
        }
      }
    } else if (scopeEnt.isFile() && scopeEnt.name.endsWith('.md')) {
      out.set(scopeEnt.name.replace(/\.md$/, ''), scopePath);
    }
  }
  return out;
}

// --- Patch application ------------------------------------------------------
// A patch file (mode: patch) carries `## remove` / `## replace` / `## add`
// sections operating on the lower-tier base body. Bullets in the base are
// anchored with `<!-- id: <slug> -->` prefixes; patches reference an id first
// and fall back to exact text. An anchor that matches nothing is an orphan:
// the base loads un-patched and the orphan is flagged (never a silent no-op).

function parsePatchDeltas(patchBody) {
  const deltas = { remove: [], replace: [], add: [] };
  const sections = patchBody.split(/^##\s+/m);
  for (const sec of sections) {
    const head = sec.match(/^(remove|replace|add)\b/i);
    if (!head) continue;
    const kind = head[1].toLowerCase();
    const rest = sec.slice(head[0].length);
    if (kind === 'remove') {
      for (const m of rest.matchAll(/^\s*-\s*(.+?)\s*$/gm)) {
        deltas.remove.push(m[1].trim());
      }
    } else if (kind === 'add') {
      for (const m of rest.matchAll(/^\s*-\s*(.+?)\s*$/gm)) {
        deltas.add.push(m[1].trim());
      }
    } else if (kind === 'replace') {
      // `- id: <id>` followed by `with: <text>`.
      const blocks = rest.split(/^\s*-\s+/m).filter((b) => /\bid:/.test(b));
      for (const b of blocks) {
        const idM = b.match(/id:\s*(.+)/);
        const withM = b.match(/with:\s*([\s\S]+)/);
        if (idM && withM) {
          deltas.replace.push({
            id: idM[1].trim(),
            with: withM[1].trim(),
          });
        }
      }
    }
  }
  return deltas;
}

// Locate a base bullet line by anchor id, else by exact text match. Returns the
// matched line index in `lines`, or -1.
function findBulletLine(lines, ref) {
  const byId = lines.findIndex((l) =>
    new RegExp(`<!--\\s*id:\\s*${escapeRegExp(ref)}\\s*-->`).test(l)
  );
  if (byId !== -1) return byId;
  // Fall back to exact text (anchor-stripped comparison).
  return lines.findIndex((l) => stripAnchors(l).trim() === ref.trim());
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyPatch(baseBody, deltas) {
  let lines = baseBody.split(/\r?\n/);
  const orphans = [];

  for (const ref of deltas.remove) {
    const idx = findBulletLine(lines, ref);
    if (idx === -1) {
      orphans.push({ op: 'remove', ref });
      continue;
    }
    lines.splice(idx, 1);
  }

  for (const rep of deltas.replace) {
    const idx = findBulletLine(lines, rep.id);
    if (idx === -1) {
      orphans.push({ op: 'replace', ref: rep.id });
      continue;
    }
    // Preserve the leading anchor (so identity survives) but swap the text.
    const anchor = lines[idx].match(/^(\s*<!--\s*id:[^>]*-->\s*)/);
    lines[idx] = (anchor ? anchor[1] : '- ') + rep.with;
  }

  if (deltas.add.length) {
    lines.push(...deltas.add.map((a) => `- ${a}`));
  }

  return { body: lines.join('\n'), orphans };
}

// --- Anchor strip -----------------------------------------------------------
// `<!-- id: ... -->` prefixes are patch targets, never context. Strip them from
// every resolved body before it reaches the model (step 5). Deliver strips too
// (defense-in-depth) but the hook path does not go through deliver, so this is
// the load-bearing strip for primed output.

function stripAnchors(text) {
  return text.replace(/<!--\s*id:\s*[^>]*-->\s*/g, '');
}

// --- Resolution -------------------------------------------------------------
// Resolve every <scope>/<name> key to one winning, patched, stripped body.
// Returns { rules: [...], warnings: [...] } where each rule is
//   { key, name, scope, relevance, kind, body, tier, nonDefault, annotation, orphans }.

function resolveRules({ cwd, scopes, relevancePhases } = {}) {
  const result = { rules: [], warnings: [] };
  try {
    const { disabled, tiers } = loadManifests(cwd);

    // Enumerate every enabled tier, low → high.
    const tierMaps = [];
    for (const tier of TIER_ORDER) {
      if (!tierEnabled(tier, tiers)) continue;
      const dir = tierDir(tier, cwd);
      tierMaps.push({ tier, map: enumerateTier(dir) });
    }

    // Collect every key seen across tiers.
    const allKeys = new Set();
    for (const { map } of tierMaps) for (const k of map.keys()) allKeys.add(k);

    for (const key of allKeys) {
      if (disabled.has(key)) continue; // step 4

      // Highest tier that has this key wins as the candidate. Walk high → low.
      let winner = null;
      for (let i = tierMaps.length - 1; i >= 0; i--) {
        if (tierMaps[i].map.has(key)) {
          winner = tierMaps[i];
          break;
        }
      }
      if (!winner) continue;

      const winnerPath = winner.map.get(key);
      let raw;
      try {
        raw = fs.readFileSync(winnerPath, 'utf8');
      } catch {
        continue; // unreadable file → skip, fail-open
      }
      const { fm, body } = splitFrontmatter(raw);

      let resolvedBody = body;
      let orphans = [];
      let patched = false;

      // mode: patch → load the lower-tier base and apply deltas.
      if (fm.mode === 'patch' && fm.override) {
        const baseEntry = findBase(tierMaps, winner.tier, fm.override);
        if (baseEntry) {
          let baseRaw;
          try {
            baseRaw = fs.readFileSync(baseEntry.path, 'utf8');
          } catch {
            baseRaw = null;
          }
          if (baseRaw != null) {
            const base = splitFrontmatter(baseRaw);
            const deltas = parsePatchDeltas(body);
            const applied = applyPatch(base.body, deltas);
            resolvedBody = applied.body;
            orphans = applied.orphans;
            patched = true;
          }
        } else {
          result.warnings.push(`patch ${key} → no base for override ${fm.override}`);
        }
      }

      // Scope/relevance hard filters (when the caller passed them).
      if (scopes && scopes.length) {
        const fileScopes = Array.isArray(fm.scope) ? fm.scope : fm.scope ? [fm.scope] : [];
        if (!fileScopes.some((s) => scopes.includes(s))) continue;
      }
      if (relevancePhases && relevancePhases.length) {
        const rel = String(fm.relevance || '');
        const matches =
          rel.includes('always') ||
          relevancePhases.some((p) => rel.includes(p));
        if (!matches) continue;
      }

      const stripped = stripAnchors(resolvedBody).replace(/\n{3,}/g, '\n\n').trim();
      const nonDefault = winner.tier !== TIER_SHIPPED || patched;
      const annotation = buildAnnotation(winner.tier, patched, orphans);

      result.rules.push({
        key,
        name: fm.name || key,
        scope: Array.isArray(fm.scope) ? fm.scope : fm.scope ? [fm.scope] : [],
        relevance: fm.relevance || '',
        kind: fm.kind || 'architectural-rule',
        body: stripped,
        tier: winner.tier,
        nonDefault,
        annotation,
        orphans,
      });

      for (const o of orphans) {
        result.warnings.push(`orphaned anchor in ${key}: ${o.op} "${o.ref}"`);
      }
    }
  } catch (err) {
    // Total failure → empty result, never throw. The hook degrades to "no
    // primed rules" rather than breaking the turn.
    result.warnings.push(`resolve-rules failed: ${err && err.message}`);
  }

  // Stable order: shipped-tier first by key, so output is deterministic.
  result.rules.sort((a, b) => a.key.localeCompare(b.key));
  return result;
}

// Find the base file for a patch's `override: <key>` in any tier strictly below
// the patch's own tier (a patch composes onto the next-lower tier that has it).
function findBase(tierMaps, patchTier, overrideKey) {
  const patchIdx = TIER_ORDER.indexOf(patchTier);
  for (let i = patchIdx - 1; i >= 0; i--) {
    const tm = tierMaps.find((t) => t.tier === TIER_ORDER[i]);
    if (tm && tm.map.has(overrideKey)) {
      return { tier: TIER_ORDER[i], path: tm.map.get(overrideKey) };
    }
  }
  return null;
}

// Exception-only annotation (step 6). A plain shipped rule returns '' — zero
// annotation tokens. Non-default rules carry a short bracket tag.
function buildAnnotation(tier, patched, orphans) {
  if (tier === TIER_SHIPPED && !patched) return '';
  const parts = [];
  if (tier === TIER_COMPANY) parts.push('company override');
  else if (tier === TIER_USER) parts.push('user override');
  else if (tier === TIER_PROJECT) parts.push('project override');
  if (patched) parts.push('patched');
  if (orphans && orphans.length) parts.push(`${orphans.length} orphaned anchor(s)`);
  return parts.length ? `[${parts.join(', ')}]` : '';
}

// Public surface: the resolver entry point, plus the tier-precedence order a
// caller may need to reason about non-default annotations. The internal helpers
// (frontmatter/patch/enumerate/strip) stay module-private — re-export them here
// only when a unit-test file or second consumer actually needs the seam.
module.exports = {
  resolveRules,
  TIER_ORDER,
};
