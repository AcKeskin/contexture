#!/usr/bin/env node
'use strict';

// SubagentStart hook: give each subagent the change-discipline rule.
// rule-prime's SessionStart context reaches only the main thread, so agents
// started by /execute or /dispatch never saw "build the minimal thing asked for".
// Resolved through the overlay, so a user or project override wins.
// Read-only built-in agents are skipped. Advisory only. Fails open.

const io = require('./lib/hook-io');
const { resolveRules } = require('./lib/resolve-rules');

const READ_ONLY = new Set(['Explore', 'Plan', 'claude-code-guide', 'statusline-setup']);

async function main() {
  const payload = await io.readPayload();
  if (READ_ONLY.has(payload.agent_type)) return io.allow();

  const cwd = payload.cwd || io.projectRoot();
  const { rules } = resolveRules({ cwd, scopes: ['change-discipline'] });
  if (!rules.length) return io.allow();

  const body = rules.map((r) => `### ${r.name}\n${r.body.trim()}`).join('\n\n');
  io.addContext('SubagentStart', `## Rules for this task (from the parent session)\n\n${body}`);
}

main().catch(() => io.allow());
