'use strict';

// Content comparison and hashing shared by link.js and verify.js, so the two
// surfaces cannot drift. All comparisons are by file bytes — size alone
// misses same-size edits.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function filesEqual(a, b) {
  const sa = fs.statSync(a);
  const sb = fs.statSync(b);
  if (sa.size !== sb.size) return false;
  return fs.readFileSync(a).equals(fs.readFileSync(b));
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
    } else if (!filesEqual(path.join(a, listA[i]), path.join(b, listB[i]))) {
      return false;
    }
  }
  return true;
}

function hashFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// walkFiles(dir) → { files, irregular }: sorted forward-slash relative paths of
// every regular file under dir. Anything that is neither a regular file nor a
// real directory (symlinks etc.) lands in `irregular` — callers deciding
// ownership must treat those as unknown provenance.
function walkFiles(dir) {
  const files = [];
  const irregular = [];
  (function walk(rel) {
    const abs = rel ? path.join(dir, rel) : dir;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) irregular.push(childRel);
      else if (entry.isDirectory()) walk(childRel);
      else if (entry.isFile()) files.push(childRel);
      else irregular.push(childRel);
    }
  })('');
  files.sort();
  return { files, irregular };
}

module.exports = { filesEqual, directoriesEqual, hashFile, walkFiles };
