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

function readPayload() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buf += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(buf || '{}'));
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

function block(reason) {
  process.stderr.write(String(reason || 'Blocked by security hook.') + '\n');
  process.exit(2);
}

// PostToolUse hooks can attach an advisory message to the tool result via
// `hookSpecificOutput.additionalContext`. The model sees this on its next
// turn as a system reminder; the tool call is not blocked. Use for warnings
// and nudges. Do not use for hard rejections — PostToolUse fires after the
// tool already ran.
const POST_TOOL_USE_EVENT = 'PostToolUse';
const HOOK_SPECIFIC_OUTPUT = 'hookSpecificOutput';
const HOOK_EVENT_NAME_KEY = 'hookEventName';
const ADDITIONAL_CONTEXT_KEY = 'additionalContext';

function advise(message) {
  const payload = {
    [HOOK_SPECIFIC_OUTPUT]: {
      [HOOK_EVENT_NAME_KEY]: POST_TOOL_USE_EVENT,
      [ADDITIONAL_CONTEXT_KEY]: String(message || ''),
    },
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(0);
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

function settingsLocal() {
  return readJsonIfExists(path.join(homeClaude(), 'settings.local.json')) || {};
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

function sessionId() {
  return process.env.CLAUDE_SESSION_ID || '<unknown>';
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
  projectRoot,
  homeClaude,
  readJsonIfExists,
  settingsLocal,
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
