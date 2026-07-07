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

  const root = io.projectRoot();
  for (const segment of splitSegments(command)) {
    if (!looksLikeForceRecursive(segment)) continue;
    for (const t of extractTargets(segment)) {
      if (isDangerousTarget(t, root)) {
        return io.block(
          `Blocked: rm -rf on top-level path '${t}'. Targets outside a subdirectory of the project are protected. ` +
            `Run manually outside Claude if intentional.`
        );
      }
    }
  }
  io.allow();
}

// Every chain/pipe/substitution boundary starts a new segment so an rm after
// `&&`, `;`, `|`, a newline, `$(...)`, backticks, or a subshell is still
// analyzed. Quotes are deliberately NOT respected: a quoted "rm -rf /" (in
// prose or an embedded `sh -c` string) is analyzed too, so it can false-block
// — the right failure mode for a safety hook.
function splitSegments(cmd) {
  return String(cmd)
    .split(/[;&|\r\n`()]+/)
    .filter((s) => s.trim().length > 0);
}

// Strip wrapping quotes so `sh -c "rm -rf /"` still yields an `rm` token;
// drop bare backslashes left by escaped operators (find -exec ... \;).
function tokenize(segment) {
  return segment
    .split(/\s+/)
    .map((t) => t.replace(/^["']+|["']+$/g, ''))
    .filter((t) => t && !/^\\+$/.test(t));
}

// Require at least one -r/-R and at least one -f across the flag group.
// Fused (-rf) and split (-r -f) both count.
function looksLikeForceRecursive(segment) {
  const tokens = tokenize(segment);
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

function extractTargets(segment) {
  const tokens = tokenize(segment);
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
    targets.push(t);
  }
  return targets;
}

function isDangerousTarget(target, root) {
  // `~/` and `$HOME/` mean the same as the bare form.
  const t = target.length > 1 ? target.replace(/\/+$/, '') : target;
  if (DANGEROUS_ROOTS.includes(t)) return true;

  // Expand ~ / $HOME variants for resolution.
  let expanded = t
    .replace(/^~(?=\/|$)/, process.env.HOME || process.env.USERPROFILE || '~')
    .replace(/\$HOME|\$\{HOME\}/g, process.env.HOME || process.env.USERPROFILE || '');

  // MSYS/Git-Bash drive spelling (/c/Users/...) is the same path as C:/Users/...
  if (process.platform === 'win32') {
    expanded = expanded.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:');
  }

  // Any target that resolves to a directory that is a prefix of (i.e. ancestor
  // of, or equal to) the project root is dangerous. Subdirectories of root are
  // allowed.
  const resolved = fold(path.resolve(expanded));
  const rootResolved = fold(path.resolve(root));

  if (resolved === rootResolved) return true;
  return rootResolved.startsWith(resolved + '/');
}

// Forward-slash, no trailing slash; case-insensitive on win32 — NTFS paths are.
function fold(p) {
  let norm = String(p).replace(/\\/g, '/');
  if (norm.length > 1) norm = norm.replace(/\/+$/, '');
  return process.platform === 'win32' ? norm.toLowerCase() : norm;
}

main().catch(() => io.allow());
