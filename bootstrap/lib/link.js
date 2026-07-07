'use strict';

// Linking primitives. Prefer symlink; fall back to recursive copy on Windows
// when symlink permission is denied. All operations idempotent; none clobber
// destinations that contain divergent user content. Copies are recorded in a
// provenance manifest (copy-manifest.js) when one is supplied: a copy still
// matching its recorded hash is bootstrap-owned and refreshed from source on
// later runs; unknown provenance always conflicts.
//
// Two modes:
//   linkDir(src, dst)      — whole-directory link. Use for subtrees owned
//                            exclusively by contexture (e.g. claude-md/).
//   linkItems(srcDir, dst) — per-item link. Use for shared namespaces where
//                            the user or third-party tools also populate the
//                            destination (e.g. ~/.claude/skills/).
//
// Options (both modes): `manifest` — a copy-manifest to record/consult copy
// provenance; `forceCopy` — skip the symlink attempt and copy directly (for
// exercising the Windows fallback where symlinks are available).

const fs = require('fs');
const path = require('path');

const { filesEqual, directoriesEqual } = require('./compare');
const { recordCopy, clearEntries, matchesRecorded } = require('./copy-manifest');

const SYMLINK_PERM_ERRORS = new Set(['EPERM', 'EACCES']);

function linkDir(src, dst, opts = {}) {
  return linkEntry(src, dst, { kind: 'dir', manifest: opts.manifest, forceCopy: opts.forceCopy });
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
    results.push(linkEntry(itemSrc, itemDst, { kind, manifest: opts.manifest, forceCopy: opts.forceCopy }));
  }
  return results;
}

function linkEntry(src, dst, { kind, manifest, forceCopy }) {
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
        // Identical content — adopting it into the manifest is safe because a
        // refresh of an identical copy is a no-op.
        if (manifest) recordCopy(manifest, dst, 'dir');
        return { action: 'up-to-date', mode: 'copy', src: absSrc, dst };
      }
      if (manifest && matchesRecorded(manifest, dst, 'dir')) {
        // Matches its recorded hashes → bootstrap-owned and unmodified; the
        // divergence is an upstream change, so refresh from source.
        fs.rmSync(dst, { recursive: true, force: true });
        copyDir(absSrc, dst);
        recordCopy(manifest, dst, 'dir');
        return { action: 'refreshed', mode: 'copy', src: absSrc, dst };
      }
      return {
        action: 'conflict',
        reason: 'destination-exists-with-different-contents',
        src: absSrc,
        dst,
      };
    } else if (kind === 'file' && existing.isFile()) {
      if (filesEqual(absSrc, dst)) {
        if (manifest) recordCopy(manifest, dst, 'file');
        return { action: 'up-to-date', mode: 'copy', src: absSrc, dst };
      }
      if (manifest && matchesRecorded(manifest, dst, 'file')) {
        fs.copyFileSync(absSrc, dst);
        recordCopy(manifest, dst, 'file');
        return { action: 'refreshed', mode: 'copy', src: absSrc, dst };
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

  if (!forceCopy) {
    const symlinkType = kind === 'dir' ? 'dir' : 'file';
    try {
      fs.symlinkSync(absSrc, dst, symlinkType);
      // The destination is a live link now, not a copy — drop any provenance
      // entries left over from an earlier copy-mode install.
      if (manifest) clearEntries(manifest, dst);
      return { action: 'created', mode: 'symlink', src: absSrc, dst };
    } catch (err) {
      if (!SYMLINK_PERM_ERRORS.has(err.code)) throw err;
    }
  }
  if (kind === 'dir') copyDir(absSrc, dst);
  else fs.copyFileSync(absSrc, dst);
  if (manifest) recordCopy(manifest, dst, kind);
  return {
    action: 'created',
    mode: 'copy',
    reason: forceCopy ? 'copy-forced' : 'symlink-denied',
    src: absSrc,
    dst,
  };
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

// Remove orphaned links left by a rename/delete. An orphan is a
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
