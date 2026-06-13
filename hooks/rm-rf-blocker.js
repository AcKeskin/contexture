#!/usr/bin/env node
'use strict';

// Block `rm -rf` on top-level paths that would be catastrophic: /, ~, $HOME,
// ., .., paths resolving to a parent of the project root. Allow `rm -rf`
// on subdirectories within the project tree — those are routine.
//
// Fails open (allow) on malformed payload — security hooks should not
// silently break non-matching tool calls.

const path = require('path');
const io = require('./lib/hook-io');

const DANGEROUS_ROOTS = ['/', '~', '$HOME', '${HOME}', '.', '..'];

async function main() {
  const payload = await io.readPayload();
  if (payload.tool_name !== 'Bash') return io.allow();

  const command = (payload.tool_input && payload.tool_input.command) || '';
  if (!/\brm\b/.test(command)) return io.allow();

  // Match `rm` with any combination of -r / -R / -f flags, including
  // fused forms like -rf, -rfv, --recursive --force, etc.
  const rmInvocation = /\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*\s+)?(?:-[a-zA-Z]*f[a-zA-Z]*\s+)?(?:--\s+)?(.+)/;
  // Simpler, safer test: require at least one -r/-R and at least one -f
  // across the flag group. Fused (-rf) and split (-r -f) both count.
  if (!looksLikeForceRecursive(command)) return io.allow();

  const targets = extractTargets(command);
  if (targets.length === 0) return io.allow();

  const root = io.projectRoot();
  for (const t of targets) {
    if (isDangerousTarget(t, root)) {
      return io.block(
        `Blocked: rm -rf on top-level path '${t}'. Targets outside a subdirectory of the project are protected. ` +
          `Run manually outside Claude if intentional.`
      );
    }
  }
  io.allow();
}

function looksLikeForceRecursive(cmd) {
  // Split into tokens, ignore anything after a shell operator, find `rm`, then
  // look at the flag tokens that immediately follow.
  const stop = cmd.search(/[;&|]/);
  const head = stop === -1 ? cmd : cmd.slice(0, stop);
  const tokens = head.split(/\s+/).filter(Boolean);
  const idx = tokens.indexOf('rm');
  if (idx === -1) return false;

  let hasR = false;
  let hasF = false;
  for (let i = idx + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('-')) break;
    if (t === '--') break;
    if (t === '--recursive') hasR = true;
    if (t === '--force') hasF = true;
    if (/^-[a-zA-Z]+$/.test(t)) {
      if (/[rR]/.test(t)) hasR = true;
      if (/f/.test(t)) hasF = true;
    }
  }
  return hasR && hasF;
}

function extractTargets(cmd) {
  const stop = cmd.search(/[;&|]/);
  const head = stop === -1 ? cmd : cmd.slice(0, stop);
  const tokens = head.split(/\s+/).filter(Boolean);
  const idx = tokens.indexOf('rm');
  if (idx === -1) return [];

  const targets = [];
  let skipFlags = true;
  for (let i = idx + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (skipFlags && t.startsWith('-')) {
      if (t === '--') skipFlags = false;
      continue;
    }
    skipFlags = false;
    // Strip surrounding quotes, if any.
    targets.push(t.replace(/^["']|["']$/g, ''));
  }
  return targets;
}

function isDangerousTarget(target, root) {
  if (DANGEROUS_ROOTS.includes(target)) return true;

  // Expand ~ / $HOME variants for resolution.
  const expanded = target
    .replace(/^~(?=\/|$)/, process.env.HOME || process.env.USERPROFILE || '~')
    .replace(/\$HOME|\$\{HOME\}/g, process.env.HOME || process.env.USERPROFILE || '');

  // Any target that resolves to a directory that is a prefix of (i.e. ancestor
  // of, or equal to) the project root is dangerous. Subdirectories of root are
  // allowed.
  const resolved = path.resolve(expanded);
  const rootResolved = path.resolve(root);

  if (resolved === rootResolved) return true; // rm -rf .
  const normResolved = resolved.replace(/\\/g, '/');
  const normRoot = rootResolved.replace(/\\/g, '/');
  if (normRoot === normResolved || normRoot.startsWith(normResolved + '/')) return true;
  return false;
}

main().catch(() => io.allow());
