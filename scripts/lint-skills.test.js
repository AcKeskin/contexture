'use strict';

// node --test scripts/lint-skills.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanHidden } = require('./lint-skills');

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-hidden-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

test('flags zero-width, bidi and tag characters with file and line', () => {
  const root = tree({
    'skills/a/SKILL.md': 'line one\nrun this​ now\n',
    'architectural-rules/x.md': 'safe ‮gnp.exe\n',
    'agents/b.md': 'hi \u{E0041}\u{E0042}\n',
  });
  const f = scanHidden(root);
  assert.equal(f.length, 3);
  assert.match(f.find((l) => l.startsWith('skills')), /SKILL\.md:2: 1 hidden character\(s\), first U\+200B/);
  assert.match(f.find((l) => l.startsWith('architectural')), /U\+202E/);
  assert.match(f.find((l) => l.startsWith('agents')), /2 hidden character\(s\), first U\+E0041/);
});

test('allows a leading BOM, emoji joiners, and plain text', () => {
  const root = tree({
    'skills/a/SKILL.md': '﻿# Title\n',
    'commands/c.md': 'dev \u{1F468}‍\u{1F4BB}\n',
    'hooks/h.js': '// plain\n',
  });
  assert.deepEqual(scanHidden(root), []);
});

test('skips files outside the scanned dirs and other extensions', () => {
  const root = tree({ 'docs/x.md': 'a​b', 'skills/a/img.png': 'a​b' });
  assert.deepEqual(scanHidden(root), []);
});
