#!/usr/bin/env node
'use strict';

// PostToolUse hook on the Agent tool (the subagent dispatcher). When a
// subagent finishes, this hook does two independent, additive checks on the
// subagent's response and emits at most one combined non-blocking advisory via
// hookSpecificOutput.additionalContext — the orchestrator sees a system
// reminder on its next turn; the tool call itself is never blocked.
//
//  1. Output-contract validation (proposal 027 umbrella). If the agent's
//     definition under <project>/agents/<type>.md declares an `## Output
//     contract` section, verify the response's last fenced ```yaml block
//     contains the v1 schema's required keys (`files_changed`,
//     `residual_risks`). Opt-in per agent; non-declaring agents are skipped.
//
//  2. Harvest recognition (proposal 050). ANY subagent — opt-in or not — may
//     append an optional `harvest:` YAML block carrying capture-worthy state
//     (decisions / lessons / open_questions) it produced in its isolated
//     context. When present and non-empty, surface a non-blocking advisory
//     summarising the counts so the parent routes the items to /capture +
//     /recap on the user's confirmation. The hook never auto-captures and
//     never rejects — capture stays Mode A (collaborator, not auto-learner).
//
// The checks are independent: harvest is recognised even for agents with no
// `## Output contract`, and a response may legitimately carry BOTH a contract
// block and a harvest block (OQ1 — separately keyed, scanned independently).
// Their advisories are concatenated into one message.
//
// Spec:  .claude/specs/agent-output-contracts/v1.md
// Plan:  .claude/plans/agent-output-contracts/v1.md (step 2)

const fs = require('fs');
const path = require('path');
const io = require('./lib/hook-io');

const AGENT_TOOL_NAME = 'Agent';
const AGENT_DIR = 'agents';
const AGENT_FILE_EXT = '.md';
const CONTRACT_HEADING = '## Output contract';
const REQUIRED_KEYS = ['files_changed', 'residual_risks'];
const YAML_FENCE_RE = /```yaml\s*\n([\s\S]*?)```/gi;
const HOOK_NAME = 'agent-output-contract-validator';
const HARVEST_KEYS = ['decisions', 'lessons', 'open_questions'];

async function main() {
  const payload = await io.readPayload();
  if (payload.tool_name !== AGENT_TOOL_NAME) return io.allow();

  const subagentType = payload.tool_input && payload.tool_input.subagent_type;
  if (!subagentType || typeof subagentType !== 'string') return io.allow();

  const responseText = extractResponseText(payload.tool_response);
  if (responseText === null) return io.allow();   // fail-open on unexpected shapes

  const advisories = [];

  // Check 1 — output-contract validation (opt-in per agent).
  const contractWarning = checkOutputContract(subagentType, responseText);
  if (contractWarning) advisories.push(contractWarning);

  // Check 2 — harvest recognition (universal, optional, additive).
  const harvestAdvisory = checkHarvest(subagentType, responseText);
  if (harvestAdvisory) advisories.push(harvestAdvisory);

  if (advisories.length === 0) return io.allow();
  io.advise(advisories.join('\n\n'));
}

// Returns a warning string when the agent opted into an Output contract but its
// response violates the schema; null when the agent didn't opt in or the
// contract is satisfied. Only opt-in agents pay the definition file read.
function checkOutputContract(subagentType, responseText) {
  const agentPath = path.join(io.projectRoot(), AGENT_DIR, subagentType + AGENT_FILE_EXT);
  if (!fs.existsSync(agentPath)) return null;

  let agentDef;
  try {
    agentDef = fs.readFileSync(agentPath, 'utf8');
  } catch {
    return null;
  }

  // Auto-detect opt-in: the agent file must declare an Output contract section.
  // Non-pilot agents (and any agent that hasn't been migrated) skip validation.
  if (!hasContractSection(agentDef)) return null;

  // Validate the last NON-harvest yaml block as the contract (OQ1): a response
  // may carry both a contract block and a `harvest:` block. Skipping harvest
  // blocks keeps the two independent — a trailing harvest block must not be
  // mistaken for the contract return and fail it spuriously.
  const block = lastContractYamlBlock(responseText);
  if (block === null) {
    return formatWarning(subagentType, 'missing required YAML result block');
  }

  const validation = validateSchema(block);
  if (!validation.ok) {
    return formatWarning(subagentType, validation.reason);
  }
  return null;
}

// Returns an advisory string when the response carries a non-empty `harvest:`
// block; null otherwise. Recognised independently of the Output contract —
// every subagent may emit it. Non-blocking: the parent is nudged to route items
// to memory, never forced, and nothing is auto-captured.
function checkHarvest(subagentType, responseText) {
  const counts = parseHarvestCounts(responseText);
  if (!counts) return null;                       // no harvest block present
  const total = counts.decisions + counts.lessons + counts.open_questions;
  if (total === 0) return null;                   // present but empty — nothing to route
  return formatHarvestAdvisory(subagentType, counts);
}

function hasContractSection(text) {
  // Match the heading at start-of-line so we don't false-positive on inline
  // mentions in prose. The trailing space/newline allows for "## Output contract"
  // followed by ` (variant)` or similar.
  const re = new RegExp('^' + escapeRegex(CONTRACT_HEADING) + '\\b', 'm');
  return re.test(text);
}

function extractResponseText(toolResponse) {
  if (!toolResponse) return null;

  // Agent tool response shape varies across harness versions. Cover the known
  // shapes; on anything else, fail open.
  if (typeof toolResponse === 'string') return toolResponse;
  if (typeof toolResponse.content === 'string') return toolResponse.content;
  if (Array.isArray(toolResponse.content)) {
    // Anthropic content-array shape: [{ type: 'text', text: '...' }, ...]
    const parts = toolResponse.content
      .filter((p) => p && typeof p.text === 'string')
      .map((p) => p.text);
    return parts.length ? parts.join('\n') : null;
  }
  return null;
}

function lastYamlBlock(text) {
  let match;
  let last = null;
  YAML_FENCE_RE.lastIndex = 0;
  while ((match = YAML_FENCE_RE.exec(text)) !== null) {
    last = match[1];
  }
  return last;
}

// The last fenced yaml block that is NOT a harvest block — the contract return.
// A harvest block (top-level `harvest:` key) is a separate channel (proposal
// 050) and must not be validated as the contract.
function lastContractYamlBlock(text) {
  let match;
  let last = null;
  YAML_FENCE_RE.lastIndex = 0;
  while ((match = YAML_FENCE_RE.exec(text)) !== null) {
    if (isHarvestBlock(match[1])) continue;
    last = match[1];
  }
  return last;
}

function isHarvestBlock(yamlText) {
  return /^\s*harvest\s*:\s*$/m.test(yamlText);
}

// Minimal validator for the v1 schema: both REQUIRED_KEYS must appear as
// top-level keys (column 0) with list values — either an inline `[]` or
// a block list (`- ` items at indent 2+). Entries are NOT parsed; the
// hook only verifies structural shape.
function validateSchema(yamlText) {
  for (const key of REQUIRED_KEYS) {
    const error = validateTopLevelList(yamlText, key);
    if (error !== null) return { ok: false, reason: error };
  }
  return { ok: true };
}

// Returns null when the key is present at the top level with a list value
// (inline `[]` or a block list); otherwise returns a human-readable error
// string explaining the specific deviation.
function validateTopLevelList(yamlText, key) {
  const lines = yamlText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp('^' + escapeRegex(key) + '\\s*:\\s*(.*)$'));
    if (!m) continue;
    const rest = m[1].trim();
    if (rest === '[]') return null;
    if (rest.length > 0) {
      // Scalar or inline mapping — not a list shape.
      return 'field `' + key + '` must be a list (got scalar or mapping)';
    }
    // Empty after the colon — expect a block list on subsequent lines.
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (next.trim() === '') continue;
      const leading = next.match(/^(\s*)/)[1];
      if (leading.length === 0) break;          // Next top-level key — empty list without `[]`.
      if (/^\s+-\s/.test(next)) return null;     // Block list item found.
      // Indented non-list content under the key.
      return 'field `' + key + '` must be a list (got scalar or mapping)';
    }
    // Either end-of-doc or next top-level key with no `- ` items: force explicit `[]`.
    return 'field `' + key + '` must be a list (got scalar or mapping)';
  }
  return 'missing required field `' + key + '` in YAML result block';
}

// Locate the `harvest:` block and count items under each known key. The block
// may appear either inside a fenced ```yaml block or as a bare top-level
// `harvest:` mapping in the response prose; we scan all yaml fences first, then
// the raw text, and use whichever contains a top-level `harvest:` key. Returns
// { decisions, lessons, open_questions } counts, or null if no harvest block is
// present. Structural-only — entries are counted, never parsed/validated.
function parseHarvestCounts(text) {
  const sources = collectHarvestSources(text);
  for (const src of sources) {
    const counts = countHarvestItems(src);
    if (counts) return counts;
  }
  return null;
}

// Candidate texts that might contain the harvest mapping: each fenced yaml
// block's body, plus the whole response (covers a bare unfenced `harvest:`).
function collectHarvestSources(text) {
  const sources = [];
  let match;
  YAML_FENCE_RE.lastIndex = 0;
  while ((match = YAML_FENCE_RE.exec(text)) !== null) {
    sources.push(match[1]);
  }
  sources.push(text);
  return sources;
}

// Given a YAML-ish text, if it has a top-level `harvest:` key, count the `- `
// list items under each of the three known sub-keys. Sub-keys sit at one indent
// level under `harvest:`; their items at a deeper indent. Returns counts or null
// when no `harvest:` key is found in this source.
function countHarvestItems(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  let harvestIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)harvest\s*:\s*$/);
    if (m) {
      harvestIndent = m[1].length;
      return countSubKeyItems(lines, i + 1, harvestIndent);
    }
  }
  return null;
}

// Walk lines after `harvest:` while they stay more-indented than harvestIndent.
// For each known sub-key, count the block-list items (`- `) that follow it at a
// deeper indent. Stops at the first line dedented to/under harvestIndent.
function countSubKeyItems(lines, start, harvestIndent) {
  const counts = { decisions: 0, lessons: 0, open_questions: 0 };
  let currentKey = null;
  let keyIndent = -1;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent <= harvestIndent) break;            // out of the harvest block

    const keyMatch = line.match(/^(\s*)([A-Za-z_]+)\s*:\s*(.*)$/);
    if (keyMatch && HARVEST_KEYS.includes(keyMatch[2]) && keyMatch[1].length > harvestIndent) {
      currentKey = keyMatch[2];
      keyIndent = keyMatch[1].length;
      // Inline empty list `key: []` → zero items; otherwise expect block list.
      if (keyMatch[3].trim() === '[]') currentKey = null;
      continue;
    }
    // A list item belongs to the most recent known sub-key if deeper-indented.
    if (currentKey && indent > keyIndent && /^\s*-\s/.test(line)) {
      counts[currentKey] += 1;
    }
  }
  return counts;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatHarvestAdvisory(agentType, counts) {
  return (
    '[' +
    HOOK_NAME +
    '] HARVEST — ' +
    agentType +
    ' returned a harvest block: ' +
    counts.decisions +
    ' decision(s), ' +
    counts.lessons +
    ' lesson(s), ' +
    counts.open_questions +
    ' open question(s). Route to memory? Decisions/lessons → /capture (kind decision|lesson|warning); ' +
    'open questions → carry into /recap. Nothing is written without your confirmation.'
  );
}

function formatWarning(agentType, reason) {
  return (
    '[' +
    HOOK_NAME +
    '] WARN — ' +
    agentType +
    ' response: ' +
    reason +
    '. Orchestrator: consider re-dispatching with an explicit reminder of the output contract.'
  );
}

main().catch(() => io.allow());
