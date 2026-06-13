'use strict';

// Linking primitives. Prefer symlink; fall back to recursive copy on Windows
// when symlink permission is denied. All operations idempotent; none clobber
// destinations that contain divergent user content.
//
// Two modes:
//   linkDir(src, dst)      — whole-directory link. Use for subtrees owned
//                            exclusively by contexture (e.g. claude-md/).
//   linkItems(srcDir, dst) — per-item link. Use for shared namespaces where
//                            the user or third-party tools also populate the
//                            destination (e.g. ~/.claude/skills/).

const fs = require('fs');
const path = require('path');

const SYMLINK_PERM_ERRORS = new Set(['EPERM', 'EACCES']);

function linkDir(src, dst) {
  return linkEntry(src, dst, { kind: 'dir' });
}

function linkItems(srcDir, dstDir, opts = {}) {
  const absSrc = path.resolve(srcDir);

  if (!fs.existsSync(absSrc)) {
    return [{ action: 'skipped', reason: 'source-missing', src: absSrc, dst: dstDir }];
  }

  fs.mkdirSync(dstDir, { recursive: true });

  const onlySet = opts.only ? new Set(opts.only) : null;

  const results = [];
  for (const entry of fs.readdirSync(absSrc, { withFileTypes: true })) {
    if (onlySet && !onlySet.has(entry.name)) continue;
    const itemSrc = path.join(absSrc, entry.name);
    const itemDst = path.join(dstDir, entry.name);
    const kind = entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other';
    if (kind === 'other') {
      results.push({ action: 'skipped', reason: 'unsupported-type', src: itemSrc, dst: itemDst });
      continue;
    }
    results.push(linkEntry(itemSrc, itemDst, { kind }));
  }
  return results;
}

function linkEntry(src, dst, { kind }) {
  const absSrc = path.resolve(src);

  if (!fs.existsSync(absSrc)) {
    return { action: 'skipped', reason: 'source-missing', src: absSrc, dst };
  }

  ensureParent(dst);

  const existing = safeLstat(dst);
  if (existing) {
    if (existing.isSymbolicLink()) {
      const current = safeReadlink(dst);
      if (current && path.resolve(path.dirname(dst), current) === absSrc) {
        return { action: 'up-to-date', mode: 'symlink', src: absSrc, dst };
      }
      fs.unlinkSync(dst);
    } else if (kind === 'dir' && existing.isDirectory()) {
      if (directoriesEqual(absSrc, dst)) {
        return { action: 'up-to-date', mode: 'copy', src: absSrc, dst };
      }
      return {
        action: 'conflict',
        reason: 'destination-exists-with-different-contents',
        src: absSrc,
        dst,
      };
    } else if (kind === 'file' && existing.isFile()) {
      if (filesEqual(absSrc, dst)) {
        return { action: 'up-to-date', mode: 'copy', src: absSrc, dst };
      }
      return {
        action: 'conflict',
        reason: 'destination-file-differs',
        src: absSrc,
        dst,
      };
    } else {
      return {
        action: 'conflict',
        reason: 'destination-type-mismatch',
        src: absSrc,
        dst,
      };
    }
  }

  const symlinkType = kind === 'dir' ? 'dir' : 'file';
  try {
    fs.symlinkSync(absSrc, dst, symlinkType);
    return { action: 'created', mode: 'symlink', src: absSrc, dst };
  } catch (err) {
    if (!SYMLINK_PERM_ERRORS.has(err.code)) throw err;
    if (kind === 'dir') copyDir(absSrc, dst);
    else fs.copyFileSync(absSrc, dst);
    return {
      action: 'created',
      mode: 'copy',
      reason: 'symlink-denied',
      src: absSrc,
      dst,
    };
  }
}

function ensureParent(target) {
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
}

function safeLstat(p) {
  try {
    return fs.lstatSync(p);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function safeReadlink(p) {
  try {
    return fs.readlinkSync(p);
  } catch {
    return null;
  }
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function directoriesEqual(a, b) {
  const listA = fs.readdirSync(a).sort();
  const listB = fs.readdirSync(b).sort();
  if (listA.length !== listB.length) return false;
  for (let i = 0; i < listA.length; i++) {
    if (listA[i] !== listB[i]) return false;
    const sa = fs.statSync(path.join(a, listA[i]));
    const sb = fs.statSync(path.join(b, listB[i]));
    if (sa.isDirectory() !== sb.isDirectory()) return false;
    if (sa.isDirectory()) {
      if (!directoriesEqual(path.join(a, listA[i]), path.join(b, listB[i]))) return false;
    } else if (sa.size !== sb.size) {
      return false;
    }
  }
  return true;
}

function filesEqual(a, b) {
  const sa = fs.statSync(a);
  const sb = fs.statSync(b);
  if (sa.size !== sb.size) return false;
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

// Remove orphaned links left by a rename/delete (proposal 072). An orphan is a
// SYMLINK in dstDir that pointed at an item in srcDir which no longer exists —
// e.g. after renaming `document` → `blueprint`, the dst `document` symlink
// dangles at the deleted source. Safety: only ever removes a dangling symlink
// whose target was inside srcDir. Never touches real files/dirs or copies —
// the destination is a shared namespace that may hold user / third-party
// content, and a copy is indistinguishable from user content.
function pruneOrphans(srcDir, dstDir, opts = {}) {
  const absSrc = path.resolve(srcDir);
  const results = [];
  if (!fs.existsSync(absSrc) || !fs.existsSync(dstDir)) return results;
  for (const entry of fs.readdirSync(dstDir)) {
    const dstPath = path.join(dstDir, entry);
    const st = safeLstat(dstPath);
    if (!st || !st.isSymbolicLink()) continue; // never touch real files/dirs/copies
    const target = safeReadlink(dstPath);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(dstPath), target);
    if (path.resolve(path.dirname(resolved)) !== absSrc) continue; // not a link into this source dir
    if (fs.existsSync(resolved)) continue; // target still exists — not an orphan
    if (!opts.dryRun) fs.unlinkSync(dstPath);
    results.push({
      action: opts.dryRun ? 'would-prune' : 'pruned',
      reason: 'orphan-target-missing',
      src: resolved,
      dst: dstPath,
    });
  }
  return results;
}

module.exports = { linkDir, linkItems, pruneOrphans };
