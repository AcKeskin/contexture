'use strict';

// Runner for prose-lint. Uses the humanize fixtures as text.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const h = require('./harness');

const t = h.makeAsserter('prose-lint');
const FIX = path.join(h.HOOKS_DIR, '..', 'skills', 'humanize', 'fixtures');

function run(home, project, rel, tool = 'Write', sid = 's1') {
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: project };
  delete env.CLAUDE_SESSION_ID;
  const payload = { session_id: sid, hook_event_name: 'PostToolUse', tool_name: tool, tool_input: { file_path: path.join(project, rel) } };
  const r = spawnSync('node', [path.join(h.HOOKS_DIR, 'prose-lint.js')], { input: JSON.stringify(payload), encoding: 'utf8', env });
  return { exit: r.status, ctx: h.additionalContext(r.stdout || '', 'PostToolUse'), stdout: r.stdout || '' };
}

function put(project, rel, text) {
  const p = path.join(project, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

const high = fs.readFileSync(path.join(FIX, 'density-high.md'), 'utf8');
const low = fs.readFileSync(path.join(FIX, 'density-low.md'), 'utf8');

{
  const home = h.makeTempHome('prose-lint-');
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'prose-proj-'));

  put(project, 'README.md', high);
  let r = run(home, project, 'README.md');
  t.assert('dense README: reported', r.ctx && r.ctx.includes('catalogue words per 1,000'), r.stdout);
  t.assert('report names words and points to /humanize', r.ctx && r.ctx.includes('robust') && r.ctx.includes('/humanize'), r.ctx);

  r = run(home, project, 'README.md', 'Edit');
  t.assert('same numbers again: silent', !r.ctx, r.stdout);

  put(project, 'README.md', low);
  r = run(home, project, 'README.md', 'Edit');
  t.assert('rewritten plain: silent', !r.ctx, r.stdout);

  put(project, 'docs/guide.md', high);
  r = run(home, project, 'docs/guide.md');
  t.assert('docs/ page: reported', !!r.ctx, r.stdout);

  put(project, 'docs/low.md', low);
  r = run(home, project, 'docs/low.md');
  t.assert('low-density doc with decoys: silent', !r.ctx, r.stdout);

  for (const rel of ['skills/x/SKILL.md', '.claude/plans/p/v1.md', 'CLAUDE.md', 'AGENTS.md', 'src/notes.md', 'docs/guide.txt']) {
    put(project, rel, high);
    r = run(home, project, rel);
    t.assert('out of scope: ' + rel, !r.ctx && r.exit === 0, r.stdout);
  }

  put(project, 'docs/short.md', 'This robust, seamless, pivotal and crucial tool leverages a vibrant landscape.\n');
  r = run(home, project, 'docs/short.md');
  t.assert('under 100 words: silent', !r.ctx, r.stdout);

  const long = Array.from({ length: 8 }, (_, i) =>
    `Step ${i} reads the file from disk and then it checks every line for the marker that the build writes when it finishes and then it moves on to the next one in the list.`
  ).join(' ');
  put(project, 'docs/long.md', long + '\n');
  r = run(home, project, 'docs/long.md');
  t.assert('long sentences: reported', r.ctx && r.ctx.includes('sentences over 30 words'), r.stdout);

  const fenced = 'Short intro line here.\n\n```\n' + high + '\n```\n';
  put(project, 'docs/code.md', fenced);
  r = run(home, project, 'docs/code.md');
  t.assert('text inside code fences: ignored', !r.ctx, r.stdout);
}

{
  const home = h.makeTempHome('prose-lint-');
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'prose-proj-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: project };
  const r = spawnSync('node', [path.join(h.HOOKS_DIR, 'prose-lint.js')], { input: '{"tool_name":"Write","tool_input":{"file_path":"/nope/README.md"}}', encoding: 'utf8', env });
  t.assert('missing or outside file: exit 0, silent', r.status === 0 && !(r.stdout || '').trim(), r.stdout);
}

t.report();
