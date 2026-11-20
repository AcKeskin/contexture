#!/usr/bin/env node
'use strict';

// Skill trace: append one line per tool call to .claude/trace/<session>.jsonl so
// /flow-check (skills/flow-check) can tell whether a skill ran in the shape it was designed
// for (review's angle agents started together, execute checked each step).
//
//   UserPromptSubmit                 a typed /skill: its name only, never the prompt
//   PreToolUse (Agent, Task, Skill)  start of the calls whose overlap the checks read
//   PostToolUse, PostToolUseFailure  end of every call, with the few input fields the
//                                    checks read (skill, agent type, command, file)
//
// Registered async, so it never delays a tool call.
// The trace folder ignores itself (.gitignore "*"). Files older than KEEP_DAYS
// are removed when a new session starts writing. Off by default (skillTrace
// bundle). Never blocks, never prints. Idea from afurmanov/harness-profiler (MIT).

const fs = require('fs');
const path = require('path');
const io = require('./lib/hook-io');

const KEEP_DAYS = 14;
const CMD_MAX = 200;
const EVENTS = { PreToolUse: 'pre', PostToolUse: 'post', PostToolUseFailure: 'fail', UserPromptSubmit: 'prompt' };

function traceDir() {
  return path.join(io.projectRoot(), '.claude', 'trace');
}

function ensureDir(dir) {
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.gitignore'), '*\n');
}

function prune(dir) {
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    const file = path.join(dir, name);
    if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
  }
}

function entry(p, ev) {
  const out = { t: Date.now(), ev };
  if (ev === 'prompt') {
    const m = /^\s*\/([\w:-]+)/.exec(String(p.prompt || ''));
    if (!m) return null;
    out.skill = m[1];
    return out;
  }
  const input = p.tool_input || {};
  out.tool = p.tool_name || '';
  if (p.tool_use_id) out.id = p.tool_use_id;
  if (p.agent_id) out.agent = p.agent_id;
  if (out.tool === 'Skill' && input.skill) out.skill = String(input.skill);
  if ((out.tool === 'Agent' || out.tool === 'Task') && input.subagent_type) out.sub = String(input.subagent_type);
  if (out.tool === 'Bash' && input.command) out.cmd = String(input.command).slice(0, CMD_MAX);
  if (input.file_path) out.file = String(input.file_path);
  if (/__write_memory$/.test(out.tool) && input.tier) out.tier = String(input.tier);
  return out;
}

async function main() {
  const p = await io.readPayload();
  const ev = EVENTS[p.hook_event_name];
  if (!ev) return;
  const line = entry(p, ev);
  if (!line) return;
  const dir = traceDir();
  ensureDir(dir);
  const file = path.join(dir, io.sessionId(p).replace(/[^\w.-]/g, '_') + '.jsonl');
  if (!fs.existsSync(file)) prune(dir);
  fs.appendFileSync(file, JSON.stringify(line) + '\n');
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
