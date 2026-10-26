#!/usr/bin/env node
'use strict';

// Generate the plugin files every tool reads from this repo:
//   Claude Code  hooks/hooks.json, .claude-plugin/plugin.json (userConfig, MCP)
//   Copilot CLI  .github/plugin/plugin.json, copilot/agents/*.agent.md
//   Codex CLI    .codex-plugin/plugin.json
//   Cursor       cursor/hooks.json, cursor/mcp.json
// Hook bundles come from settings/settings.template.json. userConfig defaults
// come from bootstrap's DEFAULT_ENABLED, so a plugin install starts with the
// same bundles on as a bootstrap install. Also checks the project-memory MCP
// bundle is current.
//
// Usage:
//   node scripts/build-plugin.js           # write the files
//   node scripts/build-plugin.js --check   # exit 1 if any is stale

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { DEFAULT_ENABLED } = require('../bootstrap/lib/enablement');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'settings', 'settings.template.json');
const HOOKS_OUT = path.join(ROOT, 'hooks', 'hooks.json');
const MANIFEST = path.join(ROOT, '.claude-plugin', 'plugin.json');
const COPILOT_MANIFEST = path.join(ROOT, '.github', 'plugin', 'plugin.json');
const CODEX_MANIFEST = path.join(ROOT, '.codex-plugin', 'plugin.json');
const AGENTS = path.join(ROOT, 'agents');
const COPILOT_AGENTS = path.join(ROOT, 'copilot', 'agents');
const CURSOR_HOOKS = path.join(ROOT, 'cursor', 'hooks.json');
const CURSOR_MCP = path.join(ROOT, 'cursor', 'mcp.json');
const MCP_BUNDLE_CHECK = path.join(ROOT, 'mcps', 'project-memory', 'scripts', 'bundle.mjs');

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

// Cursor has no generic tool events: shell commands and file edits only.
// hooks/lib/hook-io.js turns these payloads back into Claude ones.
const CURSOR_EVENTS = [
  ['PreToolUse', /\bBash\b/, 'beforeShellExecution'],
  ['PostToolUse', /\b(Write|Edit)\b/, 'afterFileEdit'],
];

const MCP_SCRIPT = 'mcps/project-memory/dist/project-memory.cjs';

function mcpServers(rootVar) {
  return { 'project-memory': { command: 'node', args: [`\${${rootVar}}/${MCP_SCRIPT}`] } };
}

function snake(name) {
  return name.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

function scriptOf(hook) {
  const match = SCRIPT_RE.exec(hook.command.replace(/\\/g, '/'));
  if (!match) throw new Error(`cannot find the hook script in: ${hook.command}`);
  return match[1];
}

function gateCommand(rootVar, bundle, hook) {
  return `node "\${${rootVar}}/hooks/plugin-gate.js" ${bundle} ${scriptOf(hook)}`;
}

function pluginBundles(template) {
  return Object.entries(template.hookBundles || {}).filter(([bundle]) => !BOOTSTRAP_ONLY.has(bundle));
}

function buildHooks(template) {
  const hooks = {};
  for (const [bundle, events] of pluginBundles(template)) {
    for (const [event, matchers] of Object.entries(events)) {
      for (const m of matchers) {
        const entry = {
          ...m,
          hooks: m.hooks.map((h) => ({ ...h, command: gateCommand('CLAUDE_PLUGIN_ROOT', bundle, h) })),
        };
        (hooks[event] = hooks[event] || []).push(entry);
      }
    }
  }
  return { hooks };
}

function buildCursorHooks(template) {
  const hooks = {};
  for (const [bundle, events] of pluginBundles(template)) {
    for (const [event, matchers] of Object.entries(events)) {
      for (const m of matchers) {
        const target = CURSOR_EVENTS.find(([e, re]) => e === event && re.test(m.matcher || ''));
        if (!target) continue;
        for (const h of m.hooks) {
          (hooks[target[2]] = hooks[target[2]] || []).push({ command: gateCommand('CURSOR_PLUGIN_ROOT', bundle, h) });
        }
      }
    }
  }
  return { version: 1, hooks };
}

function buildUserConfig(template) {
  const out = {};
  for (const [bundle] of pluginBundles(template)) {
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

// Copilot reads .github/plugin/plugin.json before .claude-plugin/plugin.json.
// It only loads agents named *.agent.md, and expands ${PLUGIN_ROOT} (not
// ${CLAUDE_PLUGIN_ROOT}) in MCP args.
function buildCopilotManifest(manifest) {
  const { name, description, author, homepage, repository, license, keywords } = manifest;
  return {
    name,
    description,
    author,
    homepage,
    repository,
    license,
    keywords,
    skills: './skills/',
    agents: './copilot/agents/',
    hooks: './hooks/hooks.json',
    mcpServers: mcpServers('PLUGIN_ROOT'),
  };
}

// Codex reads .codex-plugin/plugin.json before .claude-plugin/plugin.json. It
// expands no root variable in MCP args and runs servers from the user's
// directory, so the MCP is left out; README has the `codex mcp add` line.
function buildCodexManifest(manifest) {
  const { name, description, author, homepage, repository, license, keywords } = manifest;
  return { name, description, author, homepage, repository, license, keywords, skills: './skills/', commands: manifest.commands };
}

// Same agents without `model:`, which names a Claude model alias.
function buildCopilotAgents() {
  return fs
    .readdirSync(AGENTS)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const text = fs.readFileSync(path.join(AGENTS, f), 'utf8').replace(/\r\n/g, '\n');
      const end = text.indexOf('\n---', 4);
      const body = text.slice(0, end).replace(/^model:.*\n?/m, '') + text.slice(end);
      return [path.join(COPILOT_AGENTS, f.replace(/\.md$/, '.agent.md')), body];
    });
}

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function main() {
  const check = process.argv.includes('--check');
  const template = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

  const claudeManifest = {
    ...manifest,
    userConfig: buildUserConfig(template),
    mcpServers: mcpServers('CLAUDE_PLUGIN_ROOT'),
  };
  const outputs = [
    [HOOKS_OUT, json(buildHooks(template))],
    [MANIFEST, json(claudeManifest)],
    [COPILOT_MANIFEST, json(buildCopilotManifest(claudeManifest))],
    ...buildCopilotAgents(),
    [CODEX_MANIFEST, json(buildCodexManifest(claudeManifest))],
    [CURSOR_HOOKS, json(buildCursorHooks(template))],
    [CURSOR_MCP, json({ mcpServers: mcpServers('CURSOR_PLUGIN_ROOT') })],
  ];

  let stale = false;
  const expected = new Set(outputs.map(([file]) => file));
  for (const f of fs.existsSync(COPILOT_AGENTS) ? fs.readdirSync(COPILOT_AGENTS) : []) {
    const file = path.join(COPILOT_AGENTS, f);
    if (expected.has(file)) continue;
    stale = true;
    if (check) console.error(`stale: ${path.relative(ROOT, file)}`);
    else fs.rmSync(file);
  }
  for (const [file, content] of outputs) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current === content) continue;
    stale = true;
    if (check) console.error(`stale: ${path.relative(ROOT, file)}`);
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  }
  if (check && stale) console.error('run: node scripts/build-plugin.js');

  // The MCP bundle needs npm ci + esbuild to rebuild, so only check it here.
  let bundleOk = true;
  try {
    execFileSync(process.execPath, [MCP_BUNDLE_CHECK, '--check'], { stdio: 'inherit' });
  } catch {
    bundleOk = false;
  }
  if ((check && stale) || !bundleOk) process.exit(1);
}

main();
