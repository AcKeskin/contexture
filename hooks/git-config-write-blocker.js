#!/usr/bin/env node
'use strict';

// Block `git config --global` writes (and --system). Reads, lists, and
// project-local writes stay allowed. Global git config changes have
// machine-wide blast radius — the global CLAUDE.md rule is explicit:
// "NEVER update the git config."

const io = require('./lib/hook-io');

const READ_FLAGS = new Set([
  '--get',
  '--get-all',
  '--get-regexp',
  '--get-urlmatch',
  '--list',
  '-l',
  '--show-origin',
  '--show-scope',
  '--help',
]);

async function main() {
  const payload = await io.readPayload();
  if (payload.tool_name !== 'Bash') return io.allow();

  const command = (payload.tool_input && payload.tool_input.command) || '';
  if (!/\bgit\s+config\b/.test(command)) return io.allow();

  const stop = command.search(/[;&|]/);
  const head = stop === -1 ? command : command.slice(0, stop);
  const tokens = head.split(/\s+/).filter(Boolean);

  const configIdx = tokens.findIndex((t, i) => t === 'config' && tokens[i - 1] === 'git');
  if (configIdx === -1) return io.allow();

  const rest = tokens.slice(configIdx + 1);
  const hasGlobalScope = rest.includes('--global') || rest.includes('--system');
  if (!hasGlobalScope) return io.allow();

  const hasReadFlag = rest.some((t) => READ_FLAGS.has(t));
  if (hasReadFlag) return io.allow();

  // `git config --global --unset foo` is a write.
  // `git config --global key value` (no read flag) is a write.
  // Both blocked here.
  io.block(
    `Blocked: git config --global write. Global / system git config has machine-wide effects. ` +
      `If intentional, run manually outside Claude.`
  );
}

main().catch(() => io.allow());
