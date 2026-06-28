#!/usr/bin/env node
'use strict';

// Rule-prime hook. Two events, one file:
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
const os = require('os');
const io = require('./lib/hook-io');
const { resolveRules } = require('./lib/resolve-rules');
const { expandInstructionGlobs } = require('./lib/glob-files');

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

// --- Glob-addressed instruction files ------------------------
// An ADDITIVE, declared `rulePrime.instructions` glob-array (in hook-config.json)
// names extra instruction files to prime beyond the fixed CLAUDE.md tree — for
// monorepos (packages/*/AGENTS.md) and adopting existing instruction files in
// place (.cursor/rules/*.md). Off-by-default: absent declaration → [] → nothing
// changes (zero new always-on cost). The matched files are split into SHALLOW
// (subtree at/near the project root → floor-primed at SessionStart) and DEEP
// (nested subtree → scope-gated at UserPromptSubmit, primed only when the turn
// implicates that subtree). Both ride the existing budget cap as tier `project`.
//
// A matched file is rendered as a rule-shaped entry { name, body, tier, scope,
// annotation } so it flows through renderRules + capToBudget unchanged.

const INSTRUCTION_FILE_BYTE_CAP = 8000; // per-file read ceiling — an instruction
// source is prose guidance, not a data dump; cap the read so one huge file can't
// dominate the budget block (the budget cap then trims at the token layer too).

// Load + shape the declared instruction matches for this repo. Returns
// { shallow: [entry], deep: [{ entry, subtree }] }. Fail-soft per file.
function loadInstructionSources(cwd) {
  const result = { shallow: [], deep: [] };
  let patterns;
  try {
    patterns = io.hookConfig('rulePrime').instructions;
  } catch {
    return result; // no/!readable config → nothing
  }
  if (!Array.isArray(patterns) || patterns.length === 0) return result;

  let matches;
  try {
    matches = expandInstructionGlobs(patterns, cwd);
  } catch {
    return result; // expansion error → fail open, prime nothing extra
  }

  for (const m of matches) {
    let body;
    try {
      body = fs.readFileSync(m.file, 'utf8');
    } catch {
      continue; // unreadable match → skip
    }
    if (body.length > INSTRUCTION_FILE_BYTE_CAP) {
      body = body.slice(0, INSTRUCTION_FILE_BYTE_CAP) + '\n…(truncated — instruction file exceeds prime cap)';
    }
    const entry = {
      name: `instructions: ${m.relpath}`,
      body,
      tier: 'project', // declared-by-project → kept above plain shipped under budget pressure
      scope: ['instructions'],
      annotation: '[declared instruction source]',
    };
    // Shallow = the literal prefix is the project root or a single top-level dir
    // (no nested subtree to gate on). Deep = a nested subtree → scope-gate it.
    const depth = m.subtree ? m.subtree.split('/').length : 0;
    if (depth <= 1) result.shallow.push(entry);
    else result.deep.push({ entry, subtree: m.subtree });
  }
  return result;
}

// True when an implicated path-or-scope set intersects a declared subtree. The
// hot-path scope gate for deep instruction files: a packages/web/AGENTS.md primes
// only when the turn touches packages/web/. v1 gate = substring/segment-prefix
// intersection against the prompt text + recent files (the 035/037 resolver is
// the fuller answer; this is the pragmatic subtree-intersection it documents).
function subtreeImplicated(subtree, prompt, payload) {
  if (!subtree) return false;
  const hay = [String(prompt || '')]
    .concat((payload.recent_files || []))
    .concat((payload.recently_touched_files || []))
    .concat((payload.edited_files || []))
    .join('\n')
    .replace(/\\/g, '/')
    .toLowerCase();
  return hay.includes(subtree.toLowerCase());
}

// --- Autonomy contract — recall-before-ask line ---------------
// The autonomize organ owns one effort/stopping/ask contract; this hook is one
// of its readers. When the active contract DEVIATES from the implicit default,
// inject a single recall-before-ask deviation line so problem-1 (re-asking what
// the front-loaded artefact already answers) is addressed mechanically, at the
// turn a question would fire. At default → inject NOTHING (zero cost in the
// common case). The contract VALUES live in the `autonomy:` frontmatter of the
// session file `.claude/autonomy/active.md` (highest precedence) or, absent it,
// the resolved 047 `autonomy-default.md` rule. Fail-open: any parse/IO error
// returns null (no line) — a priming hook never blocks a turn.

const IMPLICIT_AUTONOMY = { effort: 'balanced', stopping: 'criteria-met', ask: 'forks-only' };

// Parse the `autonomy:` block (effort/stopping/ask) from a markdown/frontmatter
// file's text. Minimal — three known keys, no general YAML. Returns {} on miss.
// SCOPED: the per-key scan runs ONLY inside the matched `autonomy:` block, never
// the whole document — so a stray top-level `effort:`/`stopping:`/`ask:` elsewhere
// in the frontmatter cannot be mis-grabbed. No `autonomy:` block → {} (the caller
// then keeps the implicit default, which deviates from nothing → no recall line).
function parseAutonomyBlock(text) {
  const out = {};
  if (!text) return out;
  // Capture the indented body under an `autonomy:` line, up to the next
  // non-indented line (`^\S`), a `---` fence, or end of text.
  const m = text.match(/^autonomy:[ \t]*\r?\n([\s\S]*?)(?=^\S|^---[ \t]*$|$(?![\s\S]))/m);
  if (!m) return out; // no block → empty; do NOT fall through to the whole text
  const block = m[1];
  for (const key of ['effort', 'stopping', 'ask']) {
    const km = block.match(new RegExp(`^[ \\t]+${key}:[ \\t]*([a-z-]+)[ \\t]*$`, 'm'));
    if (km) out[key] = km[1];
  }
  return out;
}

// The 047 tier directories that can hold an autonomy-default.md, in precedence
// order (highest first). Mirrors resolve-rules.js `tierDir` — kept local because
// that function is not exported and the set is small + stable. We deliberately
// duplicate WHICH directories exist (cheap, stable) rather than couple to the
// resolver's internals. The autonomy-default rule lives under universal/.
function autonomyDefaultCandidates(cwd) {
  const home = path.join(os.homedir(), '.claude');
  const rel = path.join('universal', 'autonomy-default.md');
  return [
    cwd ? path.join(cwd, '.claude', 'rules', rel) : null, // project
    path.join(home, 'architectural-rules-local', rel), // user
    path.join(home, 'architectural-rules-company', rel), // company
    path.join(home, 'architectural-rules', rel), // shipped
  ].filter(Boolean);
}

// Resolve the effective contract: session active.md first, else the highest-
// precedence 047 autonomy-default.md rule (read directly for its `autonomy:`
// frontmatter — resolveRules emits bodies, not custom frontmatter keys, and
// exposes no file path). Returns the merged posture over the implicit default.
// Pure read; no model turn.
function resolveAutonomyContract(cwd) {
  const contract = Object.assign({}, IMPLICIT_AUTONOMY);
  try {
    // 1. Session contract (the live/kickoff write target): project active.md.
    const activePath = path.join(cwd, '.claude', 'autonomy', 'active.md');
    if (fs.existsSync(activePath)) {
      Object.assign(contract, parseAutonomyBlock(fs.readFileSync(activePath, 'utf8')));
      return contract;
    }
    // 2. Persistent default: first existing autonomy-default.md down the tiers.
    for (const p of autonomyDefaultCandidates(cwd)) {
      if (fs.existsSync(p)) {
        Object.assign(contract, parseAutonomyBlock(fs.readFileSync(p, 'utf8')));
        break;
      }
    }
  } catch {
    // Fail-open — any error leaves the implicit default, which deviates from
    // nothing, so no line is injected. A contract read never breaks a turn.
  }
  return contract;
}

// Build the recall-before-ask line IFF the contract deviates from the implicit
// default. Returns the line string, or null at default (the common, zero-cost
// case). The `ask` posture shapes the emphasis; any deviation triggers the line.
function autonomyRecallLine(cwd) {
  const c = resolveAutonomyContract(cwd);
  const deviates =
    c.effort !== IMPLICIT_AUTONOMY.effort ||
    c.stopping !== IMPLICIT_AUTONOMY.stopping ||
    c.ask !== IMPLICIT_AUTONOMY.ask;
  if (!deviates) return null;
  return (
    `## Autonomy contract active (effort=${c.effort}, stopping=${c.stopping}, ask=${c.ask})\n` +
    `Before asking the user a question, first scan the front-loaded context ` +
    `(the handed-over spec / example / checklist / rules) and state why the answer ` +
    `is not derivable from it — recall and apply what you were already given rather ` +
    `than re-asking. Calibrate effort and stopping to the contract above. ` +
    `(Autonomy contract. Run /autonomize to adjust.)`
  );
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

  // Glob-addressed instruction sources: shallow matches join the floor.
  // Deep (nested-subtree) matches are scope-gated at UserPromptSubmit, not here.
  const instructionSources = loadInstructionSources(cwd);
  const floorRules = floor.rules.concat(instructionSources.shallow);
  for (const e of instructionSources.shallow) for (const s of e.scope) primedScopes.add(s);

  // Budget guard: cap the always-tier (the per-task cost) at the 046/047 floor.
  // Project-tier rules are not always-on, but they ride the same SessionStart
  // injection, so we guard the combined floor block and drop lowest-priority
  // (resolver returns them key-sorted) rules on overflow rather than blocking.
  const renderOne = (r) =>
    `\n### ${r.name}${r.annotation ? ' ' + r.annotation : ''}\n${r.body}`;
  const capped = capToBudget(floorRules, renderOne, ALWAYS_TIER_TOKEN_CAP);
  if (capped.overflowed) {
    logBudgetAdvisory(
      `resolved floor ≈${estimateTokens(floorRules.map(renderOne).join(''))} tok ` +
        `exceeds ${ALWAYS_TIER_TOKEN_CAP} tok cap; injected ${capped.kept.length}/${floorRules.length} rules ` +
        `(${capped.dropped} dropped). Trim universal/ relevance:always or phase-gate rules (incl. declared instruction sources).`
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

  // The two injections this branch can make, assembled independently and
  // combined into one additionalContext block:
  //   (a) drift-prime — language/domain rule bodies for newly-implicated scopes
  //   (b) the autonomy recall-before-ask line, IFF the contract deviates from
  //       default. (b) is scope-independent — it must fire even
  //       when no rule scopes are fresh, so it is computed before the rule-block
  //       early returns and the handler no longer bails before reaching it.
  const sections = [];

  // (b) Autonomy recall line — deviation-only, zero cost at default.
  const recall = autonomyRecallLine(cwd);
  if (recall) sections.push(recall);

  // (a) Drift-prime rule bodies for freshly-implicated, not-yet-primed scopes.
  const implicated = new Set([
    ...detectScopesFromText(prompt),
    ...detectScopesFromFiles(payload),
  ]);
  let freshPrimed = [];
  if (implicated.size) {
    const primed = primedScopeSet();
    const fresh = [...implicated].filter((s) => !primed.has(s));
    if (fresh.length) {
      const res = resolveRules({ cwd, scopes: fresh });
      const block = res.rules.length
        ? renderRules(res.rules, { heading: `## Primed rules for this turn (${fresh.join(', ')})` })
        : '';
      if (block) {
        sections.push(block);
        freshPrimed = fresh; // only watermark scopes we actually primed
      }
    }
  }

  // (c) Deep glob-addressed instruction sources — scope-gated. A nested-
  // subtree match (packages/web/AGENTS.md) primes only when this turn implicates
  // that subtree, and only once per session (watermarked by `instructions:<sub>`).
  let freshSubtrees = [];
  {
    const deep = loadInstructionSources(cwd).deep;
    if (deep.length) {
      const primed = primedScopeSet();
      const fresh = deep.filter(
        (d) =>
          subtreeImplicated(d.subtree, prompt, payload) &&
          !primed.has(`instructions:${d.subtree}`)
      );
      if (fresh.length) {
        const block = renderRules(fresh.map((d) => d.entry), {
          heading: `## Primed instruction sources for this turn (${[...new Set(fresh.map((d) => d.subtree))].join(', ')})`,
        });
        if (block) {
          sections.push(block);
          freshSubtrees = [...new Set(fresh.map((d) => `instructions:${d.subtree}`))];
        }
      }
    }
  }

  if (!sections.length) return io.allow(); // nothing to inject this turn

  // UserPromptSubmit's model-visible channel is hookSpecificOutput.additionalContext.
  const out = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: sections.join('\n\n'),
    },
  };
  process.stdout.write(JSON.stringify(out) + '\n');

  // Record the newly-primed scopes + instruction subtrees so a later prompt for
  // the same tier/subtree is a no-op. (The recall line is not watermarked — it
  // re-asserts every turn the contract deviates, which is the point.)
  if (freshPrimed.length || freshSubtrees.length) {
    const merged = new Set([...(readMark().scopes || []), ...freshPrimed, ...freshSubtrees]);
    writeMark({ scopes: [...merged] });
  }
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
