#!/usr/bin/env node
'use strict';

// Rule-prime hook (proposal 077). Two events, one file:
//
//   SessionStart (startup | clear | compact)  → FLOOR prime via { context }
//       Resolve always-tier + project-tier rule bodies and inject them so the
//       relevant architectural rules are simply *present* in context — no manual
//       /prep. If the repo is single-language, also prime that one language tier
//       (eager-single, defer-polyglot). Writes a per-session watermark recording
//       the primed tier-set.
//
//   UserPromptSubmit                           → DRIFT prime via additionalContext
//       Deterministically (no model call) derive which language/domain tiers the
//       prompt implicates and inject only the ones not already primed this
//       session (idempotent against the floor).
//
// Why these two events: they are the only lifecycle events with a model-visible
// non-blocking output channel — SessionStart exposes `{ context }`, UserPrompt-
// Submit exposes `hookSpecificOutput.additionalContext`. SubagentStop / PreCompact
// do not (the 049 / 056-v2 wall), which is exactly why 077 uses these two.
//
// Resolution is delegated to hooks/lib/resolve-rules.js (the 047 overlay as code),
// NOT reimplemented here. This file is the trigger; that module is the engine.
//
// Fail-open: any error injects nothing and exits 0. A priming hook must never
// block a turn or crash session start. Budget-guarded: the injected always-tier
// is capped; on overflow it logs an advisory and degrades.

const fs = require('fs');
const path = require('path');
const io = require('./lib/hook-io');
const { resolveRules } = require('./lib/resolve-rules');

// Per-session watermark key in ~/.claude/session-state.json. Records the primed
// tier-set so UserPromptSubmit stays idempotent and /prep can run the deep pass.
const WATERMARK_KEY = 'rulePrime';

// --- Language census --------------------------------------------------------
// Map file extensions → the architectural-rules scope folder for that language.
// Only languages with a shipped rule tier need an entry; everything else is
// "uncounted" and does not vote for a language tier.

const EXT_TO_SCOPE = {
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.h': 'cpp', '.hh': 'cpp',
  '.cs': 'csharp',
  '.py': 'python',
  '.rs': 'rust',
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'typescript', '.jsx': 'typescript', '.mjs': 'typescript',
  '.sql': 'sql',
  '.sh': 'bash', '.bash': 'bash',
  '.gd': 'godot',
};

// Directories never worth censusing — vendored / generated / VCS noise.
const CENSUS_SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'target',
  'bin', 'obj', '.venv', 'venv', '__pycache__', '.next', '.cache', 'vendor',
  'coverage', '.worktrees', '.claude',
]);

// Walk the repo tree (bounded) and tally files per language scope. Returns
// { counts: { scope: n }, total, dominant, isSingleLanguage }. Bounded by a file
// cap so the census stays cheap even on large trees (a SessionStart cost).
function languageCensus(root, { fileCap = 4000 } = {}) {
  const counts = Object.create(null);
  let total = 0;
  let seen = 0;

  const stack = [root];
  while (stack.length && seen < fileCap) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (seen >= fileCap) break;
      if (ent.name.startsWith('.') && ent.name !== '.claude') {
        // hidden dirs/files skipped (but we already exclude .claude via SKIP)
      }
      if (ent.isDirectory()) {
        if (CENSUS_SKIP_DIRS.has(ent.name)) continue;
        stack.push(path.join(dir, ent.name));
      } else if (ent.isFile()) {
        seen++;
        const ext = path.extname(ent.name).toLowerCase();
        const scope = EXT_TO_SCOPE[ext];
        if (scope) {
          counts[scope] = (counts[scope] || 0) + 1;
          total++;
        }
      }
    }
  }

  // Dominant = highest count. Single-language when one scope holds an
  // overwhelming majority (≥80% of counted source files) and there is real
  // signal (≥3 files) — a couple of stray build scripts shouldn't flip a
  // C# repo to "polyglot".
  let dominant = null;
  let dominantCount = 0;
  for (const scope of Object.keys(counts)) {
    if (counts[scope] > dominantCount) {
      dominant = scope;
      dominantCount = counts[scope];
    }
  }
  const isSingleLanguage =
    total >= 3 && dominant != null && dominantCount / total >= 0.8;

  return { counts, total, dominant, isSingleLanguage };
}

// --- Budget guard -----------------------------------------------------------
// The always-tier is paid on every task, so 046/047 cap it at ~1k tokens. The
// hook enforces that ceiling: it injects up to the cap and, on overflow, logs an
// advisory (surfacing the 063 scoreboard concern mechanically). Never exceeds
// the budget, never blocks the turn, never hard-fails.
//
// Token estimate uses a chars/4 heuristic — deterministic, no tokenizer
// dependency, and the cap is a soft ceiling so approximation is acceptable.

const ALWAYS_TIER_TOKEN_CAP = 1000;
const CHARS_PER_TOKEN = 4;

function estimateTokens(text) {
  return Math.ceil((text ? text.length : 0) / CHARS_PER_TOKEN);
}

// Cap a list of rendered rule entries to a token budget. Eviction is by tier
// PRECEDENCE, not input order: when over budget, drop the lowest-precedence
// rules first (shipped < company < user < project) so a higher-tier override —
// the whole point of the 047 overlay — is never evicted ahead of a plain
// shipped rule. Within a tier, drop later-keyed rules first (stable, arbitrary
// but deterministic). Output preserves the caller's original order for
// readability. Returns { kept, dropped, tokens, overflowed }.
function capToBudget(rules, renderOne, tokenCap) {
  // Higher number = higher precedence = kept longer under pressure.
  const tierRank = { shipped: 0, company: 1, user: 2, project: 3 };
  const indexed = rules.map((r, i) => ({ r, i, t: estimateTokens(renderOne(r)) }));

  // Keep-priority order: highest tier first; ties broken by original order so
  // eviction is deterministic and bottom-up within a tier.
  const byKeepPriority = indexed.slice().sort((a, b) => {
    const ra = tierRank[a.r.tier] ?? 0;
    const rb = tierRank[b.r.tier] ?? 0;
    if (ra !== rb) return rb - ra; // higher tier kept first
    return a.i - b.i; // earlier original index kept first within a tier
  });

  const keepSet = new Set();
  let tokens = 0;
  let overflowed = false;
  for (const e of byKeepPriority) {
    if (tokens + e.t > tokenCap && keepSet.size > 0) {
      overflowed = true;
      continue; // skip this one, but a smaller lower-priority rule may still fit
    }
    // Always keep at least one rule even if it alone exceeds the cap — a single
    // oversized always-rule is a corpus problem, not a reason to inject nothing.
    keepSet.add(e.i);
    tokens += e.t;
    if (tokens > tokenCap) overflowed = true;
  }

  // Emit in the caller's original order, keeping only the budgeted set.
  const kept = indexed.filter((e) => keepSet.has(e.i)).map((e) => e.r);
  return { kept, dropped: rules.length - kept.length, tokens, overflowed };
}

// Advisory goes to stderr → the hook debug log on exit 0 (NOT model context,
// which would itself cost the budget we are guarding). Mirrors the 063
// scoreboard concern: surface always-tier growth where the user/operator sees
// it, mechanically, without paying context for the warning.
function logBudgetAdvisory(detail) {
  try {
    process.stderr.write(`[rule-prime] always-tier budget advisory: ${detail}\n`);
  } catch {
    // logging must never throw
  }
}

// --- Rendering --------------------------------------------------------------
// Turn resolved rule objects into the injected context block. Non-default rules
// carry their bracket annotation; plain shipped rules render bare (exception-
// only annotation — zero extra tokens for the common case).

function renderRules(rules, { heading }) {
  if (!rules.length) return '';
  const lines = [heading];
  for (const r of rules) {
    const tag = r.annotation ? ` ${r.annotation}` : '';
    lines.push(`\n### ${r.name}${tag}`);
    lines.push(r.body);
  }
  return lines.join('\n');
}

// --- SessionStart branch ----------------------------------------------------

function sessionStart(payload) {
  const cwd = payload.cwd || io.projectRoot();

  // Floor = always-tier (relevance: always) + project-tier rules. The resolver
  // applies the relevance filter; we ask for the `always` phase explicitly.
  const floor = resolveRules({ cwd, relevancePhases: ['always'] });

  // Language census decides whether to eagerly prime the one language tier.
  const census = languageCensus(cwd);
  const primedScopes = new Set();
  let languageRules = [];

  if (census.isSingleLanguage && census.dominant) {
    const langRes = resolveRules({ cwd, scopes: [census.dominant] });
    languageRules = langRes.rules;
    primedScopes.add(census.dominant);
  }

  // The floor rules' scopes are all "primed" for watermark purposes.
  for (const r of floor.rules) for (const s of r.scope) primedScopes.add(s);

  // Budget guard: cap the always-tier (the per-task cost) at the 046/047 floor.
  // Project-tier rules are not always-on, but they ride the same SessionStart
  // injection, so we guard the combined floor block and drop lowest-priority
  // (resolver returns them key-sorted) rules on overflow rather than blocking.
  const renderOne = (r) =>
    `\n### ${r.name}${r.annotation ? ' ' + r.annotation : ''}\n${r.body}`;
  const capped = capToBudget(floor.rules, renderOne, ALWAYS_TIER_TOKEN_CAP);
  if (capped.overflowed) {
    logBudgetAdvisory(
      `resolved floor ≈${estimateTokens(floor.rules.map(renderOne).join(''))} tok ` +
        `exceeds ${ALWAYS_TIER_TOKEN_CAP} tok cap; injected ${capped.kept.length}/${floor.rules.length} rules ` +
        `(${capped.dropped} dropped). Trim universal/ relevance:always or phase-gate rules.`
    );
  }

  const blocks = [];
  const floorBlock = renderRules(capped.kept, {
    heading: '## Primed architectural rules (floor — always + project tier)',
  });
  if (floorBlock) blocks.push(floorBlock);

  if (languageRules.length) {
    const langBlock = renderRules(languageRules, {
      heading: `## Primed language rules (${census.dominant} — single-language repo)`,
    });
    if (langBlock) blocks.push(langBlock);
  }

  // Write the floor watermark even when nothing rendered — recording "the floor
  // ran this session" is what lets /prep know it is the deep pass, and lets
  // UserPromptSubmit subtract the floor. Always-tier scopes count as primed.
  primedScopes.add('universal');
  writeMark({
    scopes: [...new Set(primedScopes)],
    floorPrimed: true,
    language: census.isSingleLanguage ? census.dominant : null,
    polyglot: !census.isSingleLanguage,
  });

  if (!blocks.length) return io.allow(); // nothing to render → still watermarked

  const context =
    blocks.join('\n\n') +
    '\n\n(Rules auto-primed by the rule-prime hook. Run /prep for the deep pass — higher top-N, task-specific domain tier.)';

  process.stdout.write(JSON.stringify({ context }) + '\n');
  return io.allow();
}

// --- Watermark accessors ----------------------------------------------------
// The per-session watermark records which tier scopes were already primed, so
// UserPromptSubmit only adds NEW tiers (idempotent against the floor) and /prep
// can tell "floor primed, I'm the deep pass". Stored under session-state.json,
// keyed by session id, namespaced (WATERMARK_KEY, declared at module top) so it
// never collides with other hooks' state. These two accessors are the single
// owner of that shape — every read/write of the watermark goes through them.

// Read this session's watermark entry, or a fresh empty entry if none.
function readMark() {
  const all = io.sessionState()[WATERMARK_KEY] || {};
  return all[io.sessionId()] || { scopes: [] };
}

// Merge `patch` into this session's watermark and persist. Best-effort: a write
// failure must never break the turn (priming is advisory). Returns nothing.
function writeMark(patch) {
  try {
    const sid = io.sessionId();
    const state = io.sessionState();
    const all = state[WATERMARK_KEY] || {};
    all[sid] = Object.assign({}, all[sid] || { scopes: [] }, patch);
    state[WATERMARK_KEY] = all;
    io.writeSessionState(state);
  } catch {
    // Best-effort — a watermark write failure must never break the turn.
  }
}

// The set of scopes already primed this session (the idempotency comparand).
function primedScopeSet() {
  return new Set(readMark().scopes || []);
}

// --- Deterministic tier detection -------------------------------------------
// Derive implicated language/domain scopes from the prompt + recently-touched
// files, with NO model call. Three cheap signals:
//   1. file extensions named in the prompt text (e.g. "foo.rs" → rust)
//   2. language keywords in the prompt (e.g. "rust", "python")
//   3. recently-touched files (payload-provided when available)
// Accept false-negatives over latency — this runs on every turn's hot path.

// Language keyword → scope. Word-boundary matched, case-insensitive.
const KEYWORD_TO_SCOPE = {
  cpp: 'cpp', 'c\\+\\+': 'cpp',
  'c#': 'csharp', csharp: 'csharp', dotnet: 'csharp', '\\.net': 'csharp',
  python: 'python', py: 'python',
  rust: 'rust', cargo: 'rust',
  typescript: 'typescript', javascript: 'typescript', 'node\\.js': 'typescript', react: 'typescript',
  sql: 'sql',
  bash: 'bash', shell: 'bash',
  godot: 'godot', gdscript: 'godot',
};

function detectScopesFromText(text) {
  const scopes = new Set();
  if (!text) return scopes;
  const lc = String(text).toLowerCase();

  // 1. File extensions named anywhere in the prompt (e.g. "edit src/lib.rs").
  for (const m of lc.matchAll(/\.([a-z0-9]+)\b/g)) {
    const scope = EXT_TO_SCOPE['.' + m[1]];
    if (scope) scopes.add(scope);
  }

  // 2. Language keywords.
  for (const [kw, scope] of Object.entries(KEYWORD_TO_SCOPE)) {
    if (new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`, 'i').test(lc)) {
      scopes.add(scope);
    }
  }
  return scopes;
}

// Recently-touched files may arrive in the payload (shape-tolerant). Map their
// extensions to scopes. Absent → contributes nothing (no I/O on the hot path).
function detectScopesFromFiles(payload) {
  const scopes = new Set();
  const candidates = []
    .concat(payload.recent_files || [])
    .concat(payload.recently_touched_files || [])
    .concat(payload.edited_files || []);
  for (const f of candidates) {
    if (typeof f !== 'string') continue;
    const scope = EXT_TO_SCOPE[path.extname(f).toLowerCase()];
    if (scope) scopes.add(scope);
  }
  return scopes;
}

// --- UserPromptSubmit branch ------------------------------------------------

function userPromptSubmit(payload) {
  const cwd = payload.cwd || io.projectRoot();
  const prompt = payload.prompt || '';

  const implicated = new Set([
    ...detectScopesFromText(prompt),
    ...detectScopesFromFiles(payload),
  ]);
  if (!implicated.size) return io.allow();

  // Subtract scopes already primed this session (idempotent against the floor).
  const primed = primedScopeSet();
  const fresh = [...implicated].filter((s) => !primed.has(s));
  if (!fresh.length) return io.allow(); // everything already primed → nothing

  const res = resolveRules({ cwd, scopes: fresh });
  if (!res.rules.length) return io.allow();

  const block = renderRules(res.rules, {
    heading: `## Primed rules for this turn (${fresh.join(', ')})`,
  });
  if (!block) return io.allow();

  // UserPromptSubmit's model-visible channel is hookSpecificOutput.additionalContext.
  const out = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: block,
    },
  };
  process.stdout.write(JSON.stringify(out) + '\n');

  // Record the newly-primed scopes so a later prompt for the same tier is a
  // no-op. Union with the existing set; writeMark preserves floor metadata.
  const merged = new Set([...(readMark().scopes || []), ...fresh]);
  writeMark({ scopes: [...merged] });
  return io.allow();
}

// --- Dispatch ---------------------------------------------------------------

async function main() {
  const payload = await io.readPayload();
  const event = payload.hook_event_name || payload.hookEventName || '';

  // SessionStart carries a `matcher` (startup | clear | compact | resume).
  // UserPromptSubmit carries a `prompt`. Dispatch on whichever shape arrives;
  // this keeps the hook usable when the harness omits hook_event_name.
  const looksSessionStart =
    event === 'SessionStart' || typeof payload.matcher === 'string';
  const looksUserPrompt =
    event === 'UserPromptSubmit' || typeof payload.prompt === 'string';

  if (looksUserPrompt && !looksSessionStart) {
    return userPromptSubmit(payload);
  }
  if (looksSessionStart) {
    return sessionStart(payload);
  }
  return io.allow();
}

main().catch(() => io.allow());
