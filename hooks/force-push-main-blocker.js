#!/usr/bin/env node
'use strict';

// Block `git push --force` (and variants) to main / master. Feature branches
// stay unrestricted. Ambiguous pushes (no target branch specified) while the
// current branch is protected count as blocked.
//
// Extend the protected-branch list via ~/.claude/hook-config.json:
//   { "forcePushMainBlocker": { "protected": ["main", "master", "release"] } }

const { execSync } = require('child_process');
const io = require('./lib/hook-io');

const DEFAULT_PROTECTED = ['main', 'master'];

async function main() {
  const payload = await io.readPayload();
  if (payload.tool_name !== 'Bash') return io.allow();

  const command = (payload.tool_input && payload.tool_input.command) || '';
  if (!/\bgit\s+push\b/.test(command)) return io.allow();

  const forced = /--force\b|\s-f\b|--force-with-lease\b/.test(command);
  if (!forced) return io.allow();

  const protectedBranches = getProtectedList();
  const target = resolveTargetBranch(command);

  if (target === null) {
    // Could not resolve — fail closed only if current branch is protected.
    const current = currentBranch();
    if (current && protectedBranches.includes(current)) {
      return io.block(
        `Blocked: ambiguous force push while on protected branch '${current}'. Specify a non-protected branch or drop --force.`
      );
    }
    return io.allow();
  }

  if (protectedBranches.includes(target)) {
    return io.block(
      `Blocked: force push to protected branch '${target}'. Push without --force, or force-push to a feature branch. ` +
        `If genuinely needed, run outside Claude.`
    );
  }

  io.allow();
}

function getProtectedList() {
  const cfg = io.hookConfig('forcePushMainBlocker');
  if (Array.isArray(cfg.protected) && cfg.protected.length > 0) return cfg.protected;
  return DEFAULT_PROTECTED;
}

function resolveTargetBranch(cmd) {
  // Strip flag tokens after `git push`, take the first two positional tokens
  // as <remote> <branch>. If only <remote> is given, we cannot know the branch
  // from the command alone — return null so caller can consult `git symbolic-ref`.
  const stop = cmd.search(/[;&|]/);
  const head = stop === -1 ? cmd : cmd.slice(0, stop);
  const tokens = head.split(/\s+/).filter(Boolean);
  const pushIdx = tokens.findIndex((t, i) => t === 'push' && tokens[i - 1] === 'git');
  if (pushIdx === -1) return null;

  const positional = [];
  for (let i = pushIdx + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('-')) continue;
    // Strip refspec suffixes like local:remote — take the remote side.
    const colon = t.indexOf(':');
    positional.push(colon === -1 ? t : t.slice(colon + 1));
  }
  if (positional.length >= 2) return positional[1];
  return null;
}

function currentBranch() {
  try {
    return execSync('git symbolic-ref --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: io.projectRoot(),
      timeout: 2000,
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

main().catch(() => io.allow());
