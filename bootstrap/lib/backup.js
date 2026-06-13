'use strict';

// Backup: when an entry that was previously linked is now in the exclude
// list, move it (or remove it, if it's a symlink — symlinks don't need
// backing up, the original lives in the repo) into a timestamped backup
// directory under ~/.claude/.contexture-backup-<YYYYMMDD-HHmm>/.
//
// One timestamp per bootstrap run, lazy-created on first need. Symlink
// removal is direct (cheap, restorable by re-running bootstrap). File or
// directory backups are moves into the backup tree.

const fs = require('fs');
const path = require('path');

function makeBackupSession(homeClaude) {
  const stamp = timestamp();
  const root = path.join(homeClaude, `.contexture-backup-${stamp}`);
  let created = false;
  return {
    root,
    backup(srcPath, subtreeName, entryName) {
      const lstat = safeLstat(srcPath);
      if (!lstat) return { action: 'skipped', reason: 'not-present' };

      if (lstat.isSymbolicLink()) {
        fs.unlinkSync(srcPath);
        return { action: 'unlinked', mode: 'symlink' };
      }

      // File or directory — move into backup tree.
      if (!created) {
        fs.mkdirSync(root, { recursive: true });
        created = true;
      }
      const dstDir = path.join(root, subtreeName);
      fs.mkdirSync(dstDir, { recursive: true });
      const dst = path.join(dstDir, entryName);
      try {
        fs.renameSync(srcPath, dst);
        return { action: 'unlinked', mode: lstat.isDirectory() ? 'dir-backup' : 'file-backup', backupPath: dst };
      } catch (err) {
        // Cross-volume rename or permission denied — copy + delete fallback.
        if (lstat.isDirectory()) {
          copyDir(srcPath, dst);
          rmDir(srcPath);
        } else {
          fs.copyFileSync(srcPath, dst);
          fs.unlinkSync(srcPath);
        }
        return { action: 'unlinked', mode: lstat.isDirectory() ? 'dir-backup' : 'file-backup', backupPath: dst, reason: err.code };
      }
    },
    wasUsed() {
      return created;
    },
  };
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}

function safeLstat(p) {
  try {
    return fs.lstatSync(p);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
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

function rmDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) rmDir(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

module.exports = { makeBackupSession };
