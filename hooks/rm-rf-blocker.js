#!/usr/bin/env node
'use strict';

// Block recursive deletes that could take out more than the caller meant:
//   - `rm -rf` on /, ~, $HOME, ., .., the project root or its parents, or a
//     top-level system directory (/etc, /usr, C:/Windows, ...)
//   - `.git` anywhere in the target, ~/.claude, ~/.ssh (and inside them)
//   - a target that starts with an unguarded variable or $(...): empty, it
//     becomes `/` or the cwd. `"${D:?}"` is the allowed spelling.
//   - `dir/*` is judged as `dir`; a bare `*` as `.`
//   - `cd X && rm -rf Y` resolves Y against X
//   - `find ... -delete` with no name test (-name, -path, -regex)
// Subdirectories of the project stay allowed.
//
// Fails open (allow) on malformed payload — security hooks should not
// silently break non-matching tool calls.

const os = require('os');
const path = require('path');
const io = require('./lib/hook-io');

const DANGEROUS_ROOTS = ['/', '~', '$HOME', '${HOME}', '.', '..'];
const HOME_PROTECTED = ['.claude', '.ssh'];
const FIND_NAME_TESTS = /^-(i?name|i?path|i?wholename|i?regex)$/;

async function main() {
  const payload = await io.readPayload();
  if (payload.tool_name !== 'Bash') return io.allow();

  const command = (payload.tool_input && payload.tool_input.command) || '';
  if (!/\b(rm|find)\b/.test(command)) return io.allow();

  const root = io.projectRoot();
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const ctx = { root, home, vars: assignments(command) };

  // Pass 1 sees rms inside $(...) and backticks; pass 2 sees an outer rm whose
  // target IS a substitution.
  for (const cmd of [command, collapseSubstitutions(command)]) {
    const reason = scan(cmd, ctx);
    if (reason) return io.block(`Blocked: ${reason} Run it yourself outside Claude if intentional.`);
  }
  io.allow();
}

function scan(cmd, ctx) {
  let cwd = ctx.root;
  const saved = [];
  for (const part of splitSegments(cmd)) {
    // A cd inside ( ) or $( ) ends with the subshell.
    if (BOUNDARY.test(part)) {
      for (const c of part) {
        if (c === '(') saved.push(cwd);
        else if (c === ')' && saved.length) cwd = saved.pop();
      }
      continue;
    }
    const tokens = tokenize(part);
    if (!tokens.length) continue;
    if (tokens[0] === 'cd') {
      const dest = tokens[1] ? expand(tokens[1], ctx, cwd) : ctx.home;
      if (dest !== null) cwd = path.resolve(cwd, dest);
      continue;
    }
    const findReason = checkFind(tokens);
    if (findReason) return findReason;
    if (!looksLikeForceRecursive(tokens)) continue;
    for (const t of extractTargets(tokens)) {
      const why = dangerReason(t, ctx, cwd);
      if (why) return `rm -rf on '${t === '$' ? '$(...)' : t}': ${why}.`;
    }
  }
  return null;
}

// Every chain/pipe/substitution boundary starts a new segment so an rm after
// `&&`, `;`, `|`, a newline, `$(...)`, backticks, or a subshell is still
// analyzed. Quotes are deliberately NOT respected: a quoted "rm -rf /" (in
// prose or an embedded `sh -c` string) is analyzed too, so it can false-block
// — the right failure mode for a safety hook. Boundaries are kept in the
// result so scan can track subshells.
const BOUNDARY = /^[;&|\r\n`()]+$/;
function splitSegments(cmd) {
  return String(cmd)
    .split(/([;&|\r\n`()]+)/)
    .filter((s) => s.trim().length > 0 || BOUNDARY.test(s));
}

// `$(...)` and backtick spans become one placeholder token.
function collapseSubstitutions(cmd) {
  let out = String(cmd).replace(/`[^`]*`/g, ' $(SUBST) ');
  let prev;
  do {
    prev = out;
    out = out.replace(/\$\([^()]*\)/g, '$SUBST');
  } while (out !== prev);
  return out;
}

// NAME=value earlier in the command, so `D=build; rm -rf "$D"` is known.
function assignments(cmd) {
  const vars = {};
  const re = /(?:^|[\s;&|(])([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|[^\s;&|)]*)/g;
  let m;
  while ((m = re.exec(cmd))) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
  return vars;
}

// Drop quotes (also mid-token, as in "$D"/*) and bare backslashes left by
// escaped operators (find -exec ... \;).
function tokenize(segment) {
  return segment
    .split(/\s+/)
    .map((t) => t.replace(/["']/g, ''))
    .filter((t) => t && !/^\\+$/.test(t));
}

// Require at least one -r/-R and at least one -f across the flag group.
// Fused (-rf) and split (-r -f) both count.
function looksLikeForceRecursive(tokens) {
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

function extractTargets(tokens) {
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

function checkFind(tokens) {
  const idx = tokens.indexOf('find');
  if (idx === -1) return null;
  const rest = tokens.slice(idx + 1);
  const del = rest.indexOf('-delete');
  if (del === -1) return null;
  // find runs left to right: a test after -delete filters nothing.
  if (rest.slice(0, del).some((t) => FIND_NAME_TESTS.test(t))) return null;
  return 'find -delete with no -name/-path test before it deletes everything under the start path. Add a name test, or rm -rf the directory by name.';
}

// Replace leading ~, $HOME, $PWD and known assignments. Returns null when the
// target starts with a variable or substitution we cannot resolve.
function expand(target, ctx, cwd) {
  let t = target.replace(/^~(?=\/|$)/, ctx.home);
  for (let i = 0; i < 5 && /\$/.test(t); i++) {
    const before = t;
    t = t.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, a, b) => {
      const name = a || b;
      if (name === 'HOME') return ctx.home;
      if (name === 'PWD') return cwd;
      if (name === 'CLAUDE_PROJECT_DIR') return ctx.root;
      if (Object.prototype.hasOwnProperty.call(ctx.vars, name)) return ctx.vars[name];
      return m;
    });
    if (t === before) break;
  }
  return /^\$/.test(t) ? null : t;
}

function dangerReason(target, ctx, cwd) {
  // `dir/*` deletes what `dir` holds; judge the directory.
  let t = target;
  if (t === '*') t = '.';
  else if (/\/\*$/.test(t)) t = t.slice(0, -2) || '/';
  // `~/` and `$HOME/` mean the same as the bare form.
  if (t.length > 1) t = t.replace(/\/+$/, '');

  if (DANGEROUS_ROOTS.includes(t)) return 'top-level path';
  // ${D:?} aborts when D is empty or unset: the safe spelling.
  if (/^\$\{[A-Za-z_][A-Za-z0-9_]*:\?[^}]*\}/.test(t)) return null;
  if (/(^|\/)\.git(\/|$)/.test(t)) return 'a .git directory';

  const expanded = expand(t, ctx, cwd);
  if (expanded === null) {
    return /^\$(SUBST|\(|$)/.test(t)
      ? 'the target is a command substitution; if it prints nothing this deletes the cwd. Resolve it into a variable and use "${D:?}"'
      : 'the target starts with a variable; if it is empty this becomes / or the cwd. Write "${D:?}" so an empty value aborts';
  }
  if (/^\$/.test(expanded) || /SUBST/.test(expanded)) return 'the target is a command substitution';

  let p = expanded;
  // MSYS/Git-Bash drive spelling (/c/Users/...) is the same path as C:/Users/...
  if (process.platform === 'win32') p = p.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:');

  const resolved = fold(path.resolve(cwd, p));
  const rootResolved = fold(path.resolve(ctx.root));
  const homeResolved = fold(path.resolve(ctx.home));

  if (resolved === rootResolved) return 'the project root';
  if (rootResolved.startsWith(resolved + '/')) return 'a parent of the project';
  if (homeResolved.startsWith(resolved + '/') || resolved === homeResolved) return 'the home directory or a parent';
  for (const name of HOME_PROTECTED) {
    const prot = `${homeResolved}/${name}`;
    if (resolved === prot || resolved.startsWith(prot + '/')) return `~/${name} is protected`;
  }
  if (depth(resolved) <= 1) return 'a top-level system directory';
  return null;
}

// Segments below the filesystem root: /etc → 1, C:/Windows → 1.
function depth(p) {
  return p.replace(/^[a-z]:/i, '').split('/').filter(Boolean).length;
}

// Forward-slash, no trailing slash; case-insensitive on win32 — NTFS paths are.
function fold(p) {
  let norm = String(p).replace(/\\/g, '/');
  if (norm.length > 1) norm = norm.replace(/\/+$/, '');
  return process.platform === 'win32' ? norm.toLowerCase() : norm;
}

main().catch(() => io.allow());
