'use strict';

// Runner for hooks/lib/rules-cli.js: list, disable and enable against a temp
// home (company tier with a locked rule) and a temp project.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const h = require('./harness');
const { addDisabled, removeDisabled } = require('../lib/rules-cli');

const t = h.makeAsserter('rules-cli');
const CLI = path.join(h.HOOKS_DIR, 'lib', 'rules-cli.js');

function cli(home, args) {
  const r = spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { HOME: home, USERPROFILE: home }),
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // left null: the assertion names the output
  }
  return { exit: r.status, json, stderr: r.stderr };
}

function rule(dir, key, extra = '') {
  const file = path.join(dir, `${key}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\nname: ${key} rule\nscope: [${key.split('/')[0]}]\n${extra}---\n- body\n`);
}

const home = h.makeTempHome('rules-cli-');
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-cli-proj-'));
rule(path.join(home, '.claude', 'architectural-rules-company'), 'acme/locked', 'locked: true\n');
rule(path.join(home, '.claude', 'architectural-rules-company'), 'universal/naming');
rule(path.join(project, '.claude', 'rules'), 'universal/naming');
const userFile = path.join(home, '.claude', 'architectural-rules.config.yaml');
const projectFile = path.join(project, '.claude', 'rules.config.yaml');

{
  const r = cli(home, ['list', '--cwd', project]);
  const rules = (r.json && r.json.rules) || [];
  const naming = rules.find((x) => x.key === 'universal/naming');
  const locked = rules.find((x) => x.key === 'acme/locked');
  t.assert('list: shipped rules come in', rules.some((x) => x.key === 'universal/change-discipline'), r.stderr);
  t.assert('list: project wins and every tier shows', naming && naming.tier === 'project' && naming.tiers.join() === 'shipped,company,project', JSON.stringify(naming));
  t.assert('list: company lock read', locked && locked.isLocked === true, JSON.stringify(locked));
  t.assert('list: no README key', !rules.some((x) => x.key === 'README'));
}

{
  const r = cli(home, ['disable', 'universal/naming', '--cwd', project]);
  const text = fs.readFileSync(userFile, 'utf8');
  t.assert('disable: new user manifest', r.exit === 0 && text === 'version: 1\ndisabled:\n  - universal/naming\n', text);
  const again = cli(home, ['disable', 'universal/naming', '--cwd', project]);
  t.assert('disable: twice is a no-op', again.json && again.json.isChanged === false && fs.readFileSync(userFile, 'utf8') === text);
  const listed = cli(home, ['list', '--cwd', project]).json.rules.find((x) => x.key === 'universal/naming');
  t.assert('list: shows where it is off', listed.disabledIn.join() === 'user', JSON.stringify(listed));
}

{
  const r = cli(home, ['disable', 'universal/naming', '--cwd', project, '--project']);
  t.assert('disable --project: project manifest', r.exit === 0 && fs.readFileSync(projectFile, 'utf8').includes('  - universal/naming'));
  const first = cli(home, ['enable', 'universal/naming', '--cwd', project]);
  t.assert('enable: project manifest first', first.json && first.json.manifest === projectFile && !fs.readFileSync(projectFile, 'utf8').includes('naming'));
  const second = cli(home, ['enable', 'universal/naming', '--cwd', project]);
  t.assert('enable: then the user manifest', second.json && second.json.manifest === userFile && fs.readFileSync(userFile, 'utf8') === 'version: 1\ndisabled:\n');
  const none = cli(home, ['enable', 'universal/naming', '--cwd', project]);
  t.assert('enable: nothing left is a no-op', none.json && none.json.isChanged === false);
}

{
  const r = cli(home, ['disable', 'acme/locked', '--cwd', project]);
  t.assert('disable: locked rule refused', r.exit === 1 && /locked/.test(r.stderr), r.stderr);
  const bad = cli(home, ['disable', 'x: y', '--cwd', project]);
  t.assert('disable: bad key refused', bad.exit === 1, bad.stderr);
  const missing = cli(home, ['disable', 'nope/none', '--cwd', project]);
  t.assert('disable: unknown key refused', missing.exit === 1 && /no rule/.test(missing.stderr), missing.stderr);
}

{
  const kept = 'version: 1\ncompany:\n  repo: x\ndisabled: []  # none yet\ntiers:\n  user: true\n';
  t.assert('add: empty flow list becomes a block, rest kept', addDisabled(kept, 'a/b') === 'version: 1\ncompany:\n  repo: x\ndisabled: # none yet\n  - a/b\ntiers:\n  user: true\n', addDisabled(kept, 'a/b'));
  const items = 'disabled:\n    - "a/b"\n\n# tail\n';
  t.assert('add: keeps item indent, before blank lines', addDisabled(items, 'c/d') === 'disabled:\n    - "a/b"\n    - c/d\n\n# tail\n', addDisabled(items, 'c/d'));
  t.assert('remove: quoted item', removeDisabled(items, 'a/b') === 'disabled:\n\n# tail\n', removeDisabled(items, 'a/b'));
  let threw = false;
  try {
    addDisabled('disabled: [a/b]\n', 'c/d');
  } catch {
    threw = true;
  }
  t.assert('add: inline list left for a person', threw);
}

t.report();
