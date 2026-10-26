'use strict';

// Shared IO helpers for the default security hooks.
//
// Each hook reads a JSON tool-call payload from stdin, inspects it, and
// decides via process exit code:
//   0 = allow (tool call proceeds)
//   2 = block (Claude Code surfaces the reason from stderr to the user)
//
// Unknown / malformed payloads allow by default — hooks must fail open,
// since a hook error should never silently break normal work.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Gemini CLI runs these hooks too, under its own event and tool names (the
// mapping its `gemini hooks migrate` uses). readPayload rewrites them to the
// Claude names the hooks check. Gemini ignores hookEventName in replies.
const GEMINI_EVENTS = {
  BeforeTool: 'PreToolUse',
  AfterTool: 'PostToolUse',
  BeforeAgent: 'UserPromptSubmit',
};
const GEMINI_TOOLS = {
  run_shell_command: 'Bash',
  write_file: 'Write',
  replace: 'Edit',
  read_file: 'Read',
};

// Cursor has no generic tool events. Its shell and file-edit events carry the
// command or path at the top level, so readPayload rebuilds a Claude payload.
// Cursor has no pre-write event, so the write blockers never run there.
const CURSOR_EVENTS = {
  beforeShellExecution: (p) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: p.command } }),
  afterFileEdit: (p) => ({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: p.file_path } }),
};

let cursor = false;

function normalisePayload(payload) {
  const fromCursor = CURSOR_EVENTS[payload.hook_event_name];
  if (fromCursor) {
    cursor = true;
    const root = Array.isArray(payload.workspace_roots) && payload.workspace_roots[0];
    if (root && !process.env.CLAUDE_PROJECT_DIR) process.env.CLAUDE_PROJECT_DIR = root;
    return { ...payload, ...fromCursor(payload) };
  }
  if (GEMINI_EVENTS[payload.hook_event_name]) payload.hook_event_name = GEMINI_EVENTS[payload.hook_event_name];
  if (GEMINI_TOOLS[payload.tool_name]) payload.tool_name = GEMINI_TOOLS[payload.tool_name];
  return payload;
}

function readPayload() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buf += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolve(normalisePayload(JSON.parse(buf || '{}')));
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

function allow() {
  process.exit(0);
}

// Cursor reads a deny from JSON stdout, not from exit 2.
function block(reason) {
  if (cursor) {
    const msg = String(reason || 'Blocked by security hook.');
    process.stdout.write(JSON.stringify({ permission: 'deny', user_message: msg, agent_message: msg }) + '\n');
    process.exit(0);
  }
  process.stderr.write(String(reason || 'Blocked by security hook.') + '\n');
  process.exit(2);
}

// The documented model-visible non-blocking channel: JSON stdout of
// `{ hookSpecificOutput: { hookEventName, additionalContext } }` on exit 0.
// SessionStart, UserPromptSubmit, and PostToolUse hooks all inject context
// this way; `hookEventName` must name the event that fired. Not a rejection
// channel — exit 2 is what blocks.
const POST_TOOL_USE_EVENT = 'PostToolUse';
const HOOK_SPECIFIC_OUTPUT = 'hookSpecificOutput';
const HOOK_EVENT_NAME_KEY = 'hookEventName';
const ADDITIONAL_CONTEXT_KEY = 'additionalContext';

function addContext(eventName, message) {
  const payload = {
    [HOOK_SPECIFIC_OUTPUT]: {
      [HOOK_EVENT_NAME_KEY]: String(eventName || ''),
      [ADDITIONAL_CONTEXT_KEY]: String(message || ''),
    },
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(0);
}

// PostToolUse advisory — attaches a warning/nudge to the tool result.
function advise(message) {
  addContext(POST_TOOL_USE_EVENT, message);
}

function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function homeClaude() {
  return path.join(os.homedir(), '.claude');
}

function readJsonIfExists(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// Hook-specific overrides live in their own file so they do not collide with
// Claude Code's strictly-validated settings.json schema (the `hooks` key in
// settings is reserved for hook-event registration).
function hookConfigAll() {
  return readJsonIfExists(path.join(homeClaude(), 'hook-config.json')) || {};
}

function hookConfig(hookName) {
  const cfg = hookConfigAll();
  return cfg[hookName] || {};
}

function sessionStatePath() {
  return path.join(homeClaude(), 'session-state.json');
}

function sessionState() {
  return readJsonIfExists(sessionStatePath()) || {};
}

function writeSessionState(next) {
  const target = sessionStatePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(next, null, 2) + '\n');
}

// Session identity comes from the stdin payload — every hook event carries
// `session_id`. The env var is a legacy fallback production does not set;
// without the payload, all sessions would collapse onto one '<unknown>' key.
function sessionId(payload) {
  return (
    (payload && payload.session_id) ||
    process.env.CLAUDE_SESSION_ID ||
    '<unknown>'
  );
}

// Normalise any path to forward-slash for cross-platform comparison.
function normalise(p) {
  if (!p) return '';
  return String(p).replace(/\\/g, '/');
}

// Resolve a path relative to cwd if not absolute. Accepts '~' as homedir.
function resolvePath(p) {
  if (!p) return '';
  let s = String(p);
  if (s.startsWith('~')) s = path.join(os.homedir(), s.slice(1));
  return normalise(path.resolve(s));
}

// True when child is `parent` or nested inside `parent`.
function isDescendant(child, parent) {
  const c = normalise(path.resolve(child));
  const p = normalise(path.resolve(parent)).replace(/\/$/, '');
  const lhs = process.platform === 'win32' ? c.toLowerCase() : c;
  const rhs = process.platform === 'win32' ? p.toLowerCase() : p;
  return lhs === rhs || lhs.startsWith(rhs + '/');
}

// Convert a simple glob (*, ?) to a RegExp. Case-insensitive by default.
function globToRegex(glob, { flags = 'i' } = {}) {
  const escaped = glob
    .split('')
    .map((ch) => {
      if (ch === '*') return '.*';
      if (ch === '?') return '.';
      if (/[.+^${}()|[\]\\]/.test(ch)) return '\\' + ch;
      return ch;
    })
    .join('');
  return new RegExp('^' + escaped + '$', flags);
}

module.exports = {
  readPayload,
  allow,
  block,
  advise,
  addContext,
  projectRoot,
  homeClaude,
  readJsonIfExists,
  hookConfigAll,
  hookConfig,
  sessionState,
  writeSessionState,
  sessionId,
  normalise,
  resolvePath,
  isDescendant,
  globToRegex,
};
