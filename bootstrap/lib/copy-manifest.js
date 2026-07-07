'use strict';

// Provenance manifest for copy-mode installs. When symlinks are denied,
// bootstrap copies content instead — and a copy is otherwise indistinguishable
// from user content on the next run. The manifest records the sha256 of every
// file bootstrap copied, so later runs can refresh their own unmodified copies
// from source. The invariant: a copy still matching its recorded hash is
// bootstrap-owned; a modified copy or one with no entry (unknown provenance)
// always conflicts and is never overwritten.
//
// Lives at <homeClaude>/bootstrap-copies.json. Keys are destination paths
// relative to homeClaude (forward slashes); a destination on another drive —
// e.g. the in-repo skills mirror on Windows — degrades to an absolute key,
// which path.relative/path.resolve round-trip consistently.

const fs = require('fs');
const path = require('path');

const { hashFile, walkFiles } = require('./compare');

const MANIFEST_NAME = 'bootstrap-copies.json';

function loadManifest(homeClaude) {
  const manifestPath = path.join(homeClaude, MANIFEST_NAME);
  let files = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (parsed && parsed.files && typeof parsed.files === 'object') files = parsed.files;
  } catch {
    // Absent or unreadable → start empty. Accurate existing copies are
    // re-adopted as they are seen; divergent ones conflict as before.
  }
  return { path: manifestPath, homeClaude, files };
}

function saveManifest(manifest) {
  const sorted = {};
  for (const key of Object.keys(manifest.files).sort()) sorted[key] = manifest.files[key];
  const tmp = `${manifest.path}.tmp`;
  fs.mkdirSync(path.dirname(manifest.path), { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, files: sorted }, null, 2)}\n`);
  fs.renameSync(tmp, manifest.path);
}

function keyFor(manifest, absPath) {
  return path.relative(manifest.homeClaude, path.resolve(absPath)).split(path.sep).join('/');
}

// Record the current content of a copy bootstrap just wrote (or verified as
// identical to source). Replaces all prior entries under the destination;
// persists only when something actually changed.
function recordCopy(manifest, dst, kind) {
  const key = keyFor(manifest, dst);
  const next = {};
  if (kind === 'file') {
    next[key] = hashFile(dst);
  } else {
    const { files } = walkFiles(dst);
    for (const rel of files) next[`${key}/${rel}`] = hashFile(path.join(dst, rel));
  }
  const previousKeys = keysUnder(manifest, key);
  let changed = previousKeys.length !== Object.keys(next).length;
  for (const k of previousKeys) {
    if (!(k in next)) changed = true;
    if (!changed && manifest.files[k] !== next[k]) changed = true;
    delete manifest.files[k];
  }
  for (const [k, v] of Object.entries(next)) {
    if (manifest.files[k] !== v) changed = true;
    manifest.files[k] = v;
  }
  if (changed) saveManifest(manifest);
}

// Drop all entries under a destination (it is no longer a copy — e.g. it
// became a symlink).
function clearEntries(manifest, dst) {
  const keys = keysUnder(manifest, keyFor(manifest, dst));
  if (!keys.length) return;
  for (const k of keys) delete manifest.files[k];
  saveManifest(manifest);
}

// True iff the destination's current content exactly matches its recorded
// hashes — every present file recorded and unchanged, every recorded file
// present, nothing irregular. No entries at all means unknown provenance.
function matchesRecorded(manifest, dst, kind) {
  const key = keyFor(manifest, dst);
  if (kind === 'file') {
    const recorded = manifest.files[key];
    return recorded !== undefined && hashFile(dst) === recorded;
  }
  const prefix = `${key}/`;
  const recorded = {};
  for (const k of keysUnder(manifest, key)) {
    if (!k.startsWith(prefix)) return false; // a 'file' entry at a dir destination
    recorded[k.slice(prefix.length)] = manifest.files[k];
  }
  if (Object.keys(recorded).length === 0) return false;
  const { files, irregular } = walkFiles(dst);
  if (irregular.length) return false;
  if (files.length !== Object.keys(recorded).length) return false;
  for (const rel of files) {
    const want = recorded[rel];
    if (want === undefined || hashFile(path.join(dst, rel)) !== want) return false;
  }
  return true;
}

function keysUnder(manifest, key) {
  const prefix = `${key}/`;
  return Object.keys(manifest.files).filter((k) => k === key || k.startsWith(prefix));
}

module.exports = { loadManifest, saveManifest, recordCopy, clearEntries, matchesRecorded, MANIFEST_NAME };
