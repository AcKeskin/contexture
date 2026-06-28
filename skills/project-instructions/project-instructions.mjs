#!/usr/bin/env node
// project-instructions.mjs — deterministic cross-tool instruction projector.
//
// Reads the curated discipline corpus (architectural-rules/ + the hand-authored
// cross-tool-core fragment) and projects it into vendor-neutral instruction files
// that non-Claude agents (Codex, Cursor, Copilot, local models) read:
//
//   AGENTS.md                                  root, 6-section, no frontmatter, lean (<32KiB)
//   .github/copilot-instructions.md            Copilot always-on core (lean — pointers, not bodies)
//   .github/instructions/<scope>.instructions.md   per-scope, applyTo glob, scoped auto-fire
//
// DETERMINISTIC: no Date, no Math.random, lexical sort everywhere → byte-stable re-runs.
// No LLM in the path (research: LLM-generated AGENTS.md hurts performance). Pure projection.
// Claude Code is untouched — it reads CLAUDE.md + the corpus, never these files.
//
// Usage: node skills/project-instructions/project-instructions.mjs [--root <dir>] [--dry-run] [--quiet]

import fs from 'node:fs';
import path from 'node:path';

const ALWAYS_ON_TOKEN_BUDGET = 1000; // soft target for the projected always-on surface (chars/4)
const AGENTS_MD_BYTE_CAP = 32 * 1024; // Codex silently truncates beyond 32 KiB

// scope → Copilot applyTo glob. Universal/config-authoring map to broad patterns;
// languages to their extensions. Lexically iterated for determinism.
const SCOPE_GLOBS = {
  universal: '**',
  'config-authoring': 'skills/**,agents/**,architectural-rules/**,hooks/**,commands/**',
  bash: '**/*.sh',
  cpp: '**/*.{cpp,cc,cxx,h,hpp,hxx}',
  csharp: '**/*.cs',
  python: '**/*.py',
  rust: '**/*.rs',
  sql: '**/*.sql',
  typescript: '**/*.{ts,tsx}',
  unity: '**/*.cs',
  web: '**/*.{html,css,jsx,tsx}',
};

function parseArgs(argv) {
  const args = { root: process.env.CLAUDE_PROJECT_DIR || process.cwd(), dryRun: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('usage: node skills/project-instructions/project-instructions.mjs [--root <dir>] [--dry-run] [--quiet]');
      process.exit(0);
    }
  }
  args.root = path.resolve(args.root);
  return args;
}

function log(args, msg) { if (!args.quiet) process.stdout.write(msg + '\n'); }

// --- corpus reading ---------------------------------------------------------

// Hand-rolled frontmatter split (codemap.mjs house style — no YAML dep).
// Returns { meta: {name, scope[], relevance[]}, body }.
function parseRuleFile(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return { meta: {}, body: text };
  let end = -1;
  for (let i = 1; i < lines.length; i++) { if (lines[i] === '---') { end = i; break; } }
  if (end === -1) return { meta: {}, body: text };
  const meta = {};
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (key === 'scope' || key === 'relevance') {
      val = val.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    }
    meta[key] = val;
  }
  const body = lines.slice(end + 1).join('\n').trim();
  return { meta, body };
}

// Strip <!-- id: ... --> anchors — they are patch targets, never reader-facing context.
function stripAnchors(body) {
  return body.replace(/<!--\s*id:[^>]*-->\s*/g, '');
}

// List scope dirs under architectural-rules/, lexically sorted.
function listScopes(rulesDir) {
  if (!fs.existsSync(rulesDir)) return [];
  return fs.readdirSync(rulesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

// Read all rule files in a scope dir, lexically sorted by filename.
function readScopeRules(scopeDir) {
  if (!fs.existsSync(scopeDir)) return [];
  return fs.readdirSync(scopeDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()
    .map((f) => ({ file: f, ...parseRuleFile(path.join(scopeDir, f)) }));
}

function isAlwaysOn(rule) {
  return Array.isArray(rule.meta.relevance) && rule.meta.relevance.includes('always');
}

// --- projection -------------------------------------------------------------

// The cross-tool-core fragment supplies the loop + pointers + boundary block.
function readCore(rulesDir) {
  const corePath = path.join(rulesDir, 'config-authoring', 'cross-tool-core.md');
  if (!fs.existsSync(corePath)) return null;
  return stripAnchors(parseRuleFile(corePath).body);
}

// Extract the boundary block (the ✅/⚠️/🚫 section) from the core body.
function extractBoundaries(coreBody) {
  if (!coreBody) return '';
  const idx = coreBody.indexOf('## Boundaries');
  if (idx === -1) return '';
  const after = coreBody.slice(idx);
  const next = after.indexOf('\n**Why:**');
  return (next === -1 ? after : after.slice(0, next)).trim();
}

// Extract the "## Stance" section (the honest-helper engagement directive) from
// the core body, so it projects into AGENTS.md alongside the boundary block.
function extractStance(coreBody) {
  if (!coreBody) return '';
  const idx = coreBody.indexOf('## Stance');
  if (idx === -1) return '';
  const after = coreBody.slice(idx);
  const next = after.indexOf('\n## ', 3);
  return (next === -1 ? after : after.slice(0, next)).trim();
}

function buildAgentsMd(root, rulesDir) {
  const core = readCore(rulesDir);
  const boundaries = extractBoundaries(core);
  const parts = [];
  parts.push('# AGENTS.md');
  parts.push('');
  parts.push('> Generated by `skills/project-instructions/project-instructions.mjs` from the discipline corpus. Do not hand-edit — edit `architectural-rules/` and re-run. Vendor-neutral; read by Codex, Cursor, Copilot, and local models. (Claude Code uses `CLAUDE.md` + the corpus directly.)');
  parts.push('');
  const stance = extractStance(core);
  if (stance) {
    parts.push(stance);
    parts.push('');
  }
  parts.push('## Commands');
  parts.push('');
  parts.push('- Codemap (read before exploring): `node skills/update-codemap/codemap.mjs` writes `.claude/codemap.md`');
  parts.push('- Codemap diagrams: `node skills/codemap-visualize/codemap-visualize.mjs`');
  parts.push('- Verify install / drift: `node bootstrap/bootstrap.js --verify`');
  parts.push('- (Project-specific test/lint/build commands: see the repo README or ask — fill these in per repo.)');
  parts.push('');
  parts.push('## Testing');
  parts.push('');
  parts.push('- Run the repo\'s test suite before committing. Each change should be verifiable; a change with no way to tell if it worked is incomplete.');
  parts.push('');
  parts.push('## Project structure');
  parts.push('');
  parts.push('- Read `.claude/codemap.md` for the file-by-file map (purpose + exports). Read `architectural-rules/` for the conventions. Read `.claude/architecture.md` if present.');
  parts.push('- Reusable skills are auto-discovered as Agent Skills from `.claude/skills/` (run `node bootstrap/bootstrap.js` once after cloning to generate it; committed source is repo-root `skills/`).');
  parts.push('');
  parts.push('## Code style');
  parts.push('');
  parts.push('- Architectural rules live in `architectural-rules/<scope>/`: `universal/` always applies; `<language>/` applies when editing that language; `config-authoring/` when editing skills/agents/rules/hooks. Read the ones matching what you touch.');
  parts.push('- Match existing style. Surgical edits — do not "improve" adjacent code.');
  parts.push('');
  parts.push('## Git workflow');
  parts.push('');
  parts.push('- One concern per commit; clear messages. Branch for feature work (`feature/<slug>`), merge `--no-ff`.');
  parts.push('- Never add AI attribution to commits or PRs (no Co-Authored-By, no "Generated with", no robot emoji).');
  parts.push('');
  if (boundaries) {
    parts.push(boundaries);
  } else {
    parts.push('## Boundaries');
    parts.push('');
    parts.push('- 🚫 Never commit secrets / credentials / `.env`. ⚠️ Plan before non-trivial changes and wait for confirmation. ✅ Read codemap + rules before coding.');
  }
  parts.push('');
  return parts.join('\n');
}

function buildCopilotInstructions(root, rulesDir) {
  const core = readCore(rulesDir);
  const parts = [];
  parts.push('# contexture — Copilot instructions');
  parts.push('');
  parts.push('> Generated from the discipline corpus by `skills/project-instructions/project-instructions.mjs`. Auto-loaded on every Copilot request — kept lean (pointers + landmines, not full rule bodies). Per-language rules auto-load via `.github/instructions/*.instructions.md` when you edit matching files.');
  parts.push('');
  if (core) {
    // Project the loop + pointers + boundaries (the lean core), not full rule bodies.
    const cut = core.indexOf('\n**Why:**');
    parts.push(cut === -1 ? core : core.slice(0, cut).trim());
  }
  parts.push('');
  parts.push('## Scoped rules');
  parts.push('');
  parts.push('Language- and domain-specific rules load automatically when you edit a matching file (via `.github/instructions/<scope>.instructions.md` `applyTo` globs). The full corpus is in `architectural-rules/`.');
  parts.push('');
  parts.push('## Skills');
  parts.push('');
  parts.push('Reusable skills (`/review`, `/spec`, `/capture`, …) are auto-discovered as Agent Skills from `.claude/skills/` — run `node bootstrap/bootstrap.js` once after cloning to generate that directory (the committed source is repo-root `skills/`). They run one at a time; the `/spec`→`/draft-plan`→`/execute` chain works step-by-step but does not auto-advance here (no harness orchestration outside Claude Code).');
  parts.push('');
  return parts.join('\n');
}

function buildScopedInstruction(scope, rules) {
  const glob = SCOPE_GLOBS[scope] || '**';
  const parts = [];
  parts.push('---');
  parts.push(`applyTo: "${glob}"`);
  parts.push('---');
  parts.push('');
  parts.push(`# ${scope} rules`);
  parts.push('');
  parts.push(`> Auto-loaded by Copilot when editing files matching \`${glob}\`. Generated from \`architectural-rules/${scope}/\` — do not hand-edit.`);
  parts.push('');
  for (const r of rules) {
    const name = r.meta.name || r.file.replace(/\.md$/, '');
    parts.push(`## ${name}`);
    parts.push('');
    parts.push(stripAnchors(r.body));
    parts.push('');
  }
  return parts.join('\n').trimEnd() + '\n';
}

// --- main -------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rulesDir = path.join(args.root, 'architectural-rules');
  if (!fs.existsSync(rulesDir)) {
    console.error(`no architectural-rules/ under ${args.root}`);
    process.exit(1);
  }

  const scopes = listScopes(rulesDir);
  const outputs = [];

  // 1. Root AGENTS.md
  const agentsMd = buildAgentsMd(args.root, rulesDir);
  outputs.push({ rel: 'AGENTS.md', content: agentsMd });

  // 2. Copilot always-on core
  outputs.push({ rel: path.join('.github', 'copilot-instructions.md'), content: buildCopilotInstructions(args.root, rulesDir) });

  // 3. Per-scope Copilot applyTo files
  for (const scope of scopes) {
    const rules = readScopeRules(path.join(rulesDir, scope));
    if (!rules.length) continue;
    outputs.push({
      rel: path.join('.github', 'instructions', `${scope}.instructions.md`),
      content: buildScopedInstruction(scope, rules),
    });
  }

  // Report + write
  for (const o of outputs) {
    const bytes = Buffer.byteLength(o.content, 'utf8');
    let warn = '';
    if (o.rel === 'AGENTS.md' && bytes > AGENTS_MD_BYTE_CAP) warn = `  ⚠ over 32KiB cap (${bytes}B)`;
    if (o.rel.endsWith('copilot-instructions.md')) {
      const est = Math.round(bytes / 4);
      warn = est > ALWAYS_ON_TOKEN_BUDGET ? `  ⚠ always-on ~${est} tok > ${ALWAYS_ON_TOKEN_BUDGET} budget` : `  (~${est} tok, within budget)`;
    }
    log(args, `${args.dryRun ? 'would write' : 'write'} ${o.rel} (${bytes}B)${warn}`);
    if (!args.dryRun) {
      const abs = path.join(args.root, o.rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, o.content);
    }
  }
  log(args, `${args.dryRun ? 'dry-run: ' : ''}${outputs.length} file(s) projected from ${scopes.length} scope(s).`);
}

main();
