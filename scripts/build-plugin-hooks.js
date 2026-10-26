#!/usr/bin/env node
'use strict';

// Project settings/settings.template.json hook bundles into the Claude Code
// plugin: hooks/hooks.json plus one boolean userConfig option per bundle in
// .claude-plugin/plugin.json. Defaults come from bootstrap's DEFAULT_ENABLED,
// so a plugin install starts with the same bundles on as a bootstrap install.
//
// Usage:
//   node scripts/build-plugin-hooks.js           # write both files
//   node scripts/build-plugin-hooks.js --check   # exit 1 if either is stale

const fs = require('fs');
const path = require('path');
const { DEFAULT_ENABLED } = require('../bootstrap/lib/enablement');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'settings', 'settings.template.json');
const HOOKS_OUT = path.join(ROOT, 'hooks', 'hooks.json');
const MANIFEST = path.join(ROOT, '.claude-plugin', 'plugin.json');

// bootstrapDrift checks bootstrap's ~/.claude links, which a plugin install has none of.
const BOOTSTRAP_ONLY = new Set(['bootstrapDrift']);

const BUNDLE_INFO = {
  security: ['Security hooks', 'Block rm -rf on top-level paths, .env writes, and writes outside the project.'],
  gitDiscipline: ['Git discipline hooks', 'Block force-push to main, global git config edits, and hook-skip flags.'],
  sessionGuard: ['Session guard', 'After /clear or compact, suggest /recap when decisions may not have been saved.'],
  wrapTerminus: ['Wrap recovery', 'After /clear or compact, suggest /wrap when a ship was never wrapped up.'],
  coordinateAuto: ['Coordinate auto-register', 'At session start, suggest registering on the shared coordinate board.'],
  agentOutputContracts: ['Agent output contracts', 'After a subagent finishes, flag output that breaks its contract.'],
  codemapDirty: ['Codemap dirty marker', 'Mark the codemap stale when files change in opted-in projects.'],
  rulePrime: ['Rule priming', 'Load matching architectural rules at session start and per prompt.'],
};

const SCRIPT_RE = /\/hooks\/([\w.-]+\.js)$/;

function snake(name) {
  return name.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

function buildHooks(template) {
  const hooks = {};
  for (const [bundle, events] of Object.entries(template.hookBundles || {})) {
    if (BOOTSTRAP_ONLY.has(bundle)) continue;
    for (const [event, matchers] of Object.entries(events)) {
      for (const m of matchers) {
        const entry = { ...m, hooks: m.hooks.map((h) => gate(bundle, h)) };
        (hooks[event] = hooks[event] || []).push(entry);
      }
    }
  }
  return { hooks };
}

function gate(bundle, hook) {
  const match = SCRIPT_RE.exec(hook.command.replace(/\\/g, '/'));
  if (!match) throw new Error(`cannot find the hook script in: ${hook.command}`);
  return {
    ...hook,
    command: `node "\${CLAUDE_PLUGIN_ROOT}/hooks/plugin-gate.js" ${bundle} ${match[1]}`,
  };
}

function buildUserConfig(template) {
  const out = {};
  for (const bundle of Object.keys(template.hookBundles || {})) {
    if (BOOTSTRAP_ONLY.has(bundle)) continue;
    const info = BUNDLE_INFO[bundle];
    if (!info) throw new Error(`add a title and description for bundle "${bundle}" to BUNDLE_INFO`);
    out[snake(bundle)] = {
      type: 'boolean',
      title: info[0],
      description: info[1],
      default: DEFAULT_ENABLED.hookBundles[bundle] !== false,
    };
  }
  return out;
}

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function main() {
  const check = process.argv.includes('--check');
  const template = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

  const outputs = [
    [HOOKS_OUT, json(buildHooks(template))],
    [MANIFEST, json({ ...manifest, userConfig: buildUserConfig(template) })],
  ];

  let stale = false;
  for (const [file, content] of outputs) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current === content) continue;
    stale = true;
    if (check) console.error(`stale: ${path.relative(ROOT, file)}`);
    else fs.writeFileSync(file, content);
  }
  if (check && stale) {
    console.error('run: node scripts/build-plugin-hooks.js');
    process.exit(1);
  }
}

main();
