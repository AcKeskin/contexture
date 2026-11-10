'use strict';

// writeFileAtomic: replaces the file whole and leaves no temp file behind.

const fs = require('fs');
const os = require('os');
const path = require('path');
const io = require('../lib/hook-io');
const h = require('./harness');

const t = h.makeAsserter('hook-io');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-io-'));
const file = path.join(dir, 'state.json');

fs.writeFileSync(file, '{"old":true}\n');
io.writeFileAtomic(file, '{"new":true}\n');
t.assert('atomic write: new content', fs.readFileSync(file, 'utf8') === '{"new":true}\n');
t.assert('atomic write: no temp file left', fs.readdirSync(dir).length === 1, fs.readdirSync(dir).join(', '));

let threw = false;
try {
  io.writeFileAtomic(path.join(dir, 'missing', 'x.json'), '{}');
} catch {
  threw = true;
}
t.assert('atomic write: missing folder throws, nothing left', threw && fs.readdirSync(dir).length === 1);

t.report();
