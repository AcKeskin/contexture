#!/usr/bin/env node
'use strict';

// PostToolUse hook on the Agent tool (the subagent dispatcher). When a
// subagent finishes, this hook checks whether the agent's definition under
// <project>/agents/<type>.md declares an `## Output contract` section. If
// so, the hook verifies the agent's response ends with a fenced ```yaml
// block containing the v1 schema's required top-level keys
// (`files_changed`, `residual_risks`).
//
// On any deviation, the hook emits a non-blocking advisory via
// hookSpecificOutput.additionalContext — the orchestrator sees a system
// reminder on its next turn, the tool call itself is never blocked.
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

async function main() {
  const payload = await io.readPayload();
  if (payload.tool_name !== AGENT_TOOL_NAME) return io.allow();

  const subagentType = payload.tool_input && payload.tool_input.subagent_type;
  if (!subagentType || typeof subagentType !== 'string') return io.allow();

  const agentPath = path.join(io.projectRoot(), AGENT_DIR, subagentType + AGENT_FILE_EXT);
  if (!fs.existsSync(agentPath)) return io.allow();

  let agentDef;
  try {
    agentDef = fs.readFileSync(agentPath, 'utf8');
  } catch {
    return io.allow();
  }

  // Auto-detect opt-in: the agent file must declare an Output contract section.
  // Non-pilot agents (and any agent that hasn't been migrated) skip validation.
  if (!hasContractSection(agentDef)) return io.allow();

  const responseText = extractResponseText(payload.tool_response);
  if (responseText === null) return io.allow();   // fail-open on unexpected shapes

  const block = lastYamlBlock(responseText);
  if (block === null) {
    return io.advise(formatWarning(subagentType, 'missing required YAML result block'));
  }

  const validation = validateSchema(block);
  if (!validation.ok) {
    return io.advise(formatWarning(subagentType, validation.reason));
  }

  io.allow();
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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
