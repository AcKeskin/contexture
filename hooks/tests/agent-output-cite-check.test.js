'use strict';

// Runner for the citation check in agent-output-contract-validator: unit cases
// for lib/cite-check.js, then the hook end to end. Run with
// `node hooks/tests/agent-output-cite-check.test.js`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const h = require('./harness');
const { extractCitations, findBrokenCitations } = require('../lib/cite-check');

const t = h.makeAsserter('agent-output-cite-check');

// A throwaway project: proj/src/app.js has 5 lines; fixture/src/util.js lives
// outside the project and is only reachable through a path in the prompt.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-cite-'));
const proj = path.join(root, 'proj');
const outside = path.join(root, 'fixture');
fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
fs.mkdirSync(path.join(outside, 'src'), { recursive: true });
fs.writeFileSync(path.join(proj, 'src', 'app.js'), 'a\nb\nc\nd\ne\n');
fs.writeFileSync(path.join(outside, 'src', 'util.js'), 'x\ny\n');
const ctx = { cwd: proj, projectRoot: proj, promptText: '' };
const raws = (list) => list.map((b) => b.raw);

// extraction
{
  const found = raws(extractCitations(
    'see src/app.js:3, src/app.js:2-4 and C:/x/y.ts:9 and app.js:4:12'
  ));
  t.assert('extracts line, range, drive path and line:col',
    found.includes('src/app.js:3') && found.includes('src/app.js:2-4') &&
    found.includes('C:/x/y.ts:9') && found.includes('app.js:4:12'),
    JSON.stringify(found));
  const none = extractCitations('https://example.com/a.js:10 and localhost:8080 and port 3:4');
  t.assert('skips URL tails and host:port', none.length === 0, JSON.stringify(raws(none)));
}

// resolution
{
  const ok = findBrokenCitations('src/app.js:5 and src/app.js:1-5', ctx);
  t.assert('lines inside the file pass', ok.length === 0, JSON.stringify(ok));

  const past = findBrokenCitations('src/app.js:9', ctx);
  t.assert('line past the end is flagged with the real length',
    past.length === 1 && past[0].reason === 'file has 5 lines', JSON.stringify(past));

  const range = findBrokenCitations('src/app.js:4-8', ctx);
  t.assert('range running past the end is flagged', range.length === 1, JSON.stringify(range));

  const missing = findBrokenCitations('src/gone.js:2', ctx);
  t.assert('missing file in an existing folder is flagged',
    missing.length === 1 && missing[0].reason === 'no such file', JSON.stringify(missing));

  const remote = findBrokenCitations('src/store/db.ts:40 and hooks/cursor/pre.mjs:3', ctx);
  t.assert('missing file in a folder that does not exist here is skipped', remote.length === 0,
    JSON.stringify(remote));

  const bare = findBrokenCitations('gone.js:2', ctx);
  t.assert('missing bare filename is skipped', bare.length === 0, JSON.stringify(bare));

  const viaPrompt = findBrokenCitations('src/util.js:2', {
    ...ctx,
    promptText: 'verify ' + path.join(outside, 'src', 'util.js').replace(/\\/g, '/') + ':2 please',
  });
  t.assert('path relative to a folder named in the prompt resolves', viaPrompt.length === 0,
    JSON.stringify(viaPrompt));
}

// hook end to end
function payload(response) {
  return JSON.stringify({
    hook_event_name: 'PostToolUse',
    cwd: proj,
    tool_name: 'Agent',
    tool_input: { subagent_type: 'general-purpose', prompt: 'review src/' },
    tool_response: { content: [{ type: 'text', text: response }] },
  });
}
{
  const r = h.runHook('agent-output-contract-validator', payload('Bug at src/app.js:42, also src/app.js:2.'));
  t.assert('broken citation exits 0', r.exit === 0, 'exit ' + r.exit);
  const msg = h.additionalContext(r.stdout, 'PostToolUse');
  t.assert('broken citation emits a CITE advisory naming the ref',
    typeof msg === 'string' && msg.includes('CITE') && msg.includes('src/app.js:42') && !msg.includes('src/app.js:2 '),
    'stdout: ' + r.stdout);
}
{
  const r = h.runHook('agent-output-contract-validator', payload('All good at src/app.js:3.'));
  t.assert('valid citations are silent', r.exit === 0 && r.stdout.trim() === '', 'stdout: ' + r.stdout);
}

fs.rmSync(root, { recursive: true, force: true });
t.report();
