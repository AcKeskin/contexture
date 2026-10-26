#!/usr/bin/env node
'use strict';

// Build a Gemini CLI extension from this repo into its own folder. Gemini reads
// hooks only from hooks/hooks.json, the same path the Claude plugin uses in a
// different format, so the extension can't share the repo root.
//
// Usage:
//   node scripts/build-gemini-extension.js <outDir>
//   gemini extensions link <outDir>

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'settings', 'settings.template.json');

// Bundles that work under Gemini. The rest read Claude transcripts, Claude's
// Agent tool, or bootstrap links, or are off by default.
const BUNDLES = ['security', 'gitDiscipline', 'codemapDirty', 'rulePrime'];

// Same mapping as `gemini hooks migrate`.
const EVENTS = {
  PreToolUse: 'BeforeTool',
  PostToolUse: 'AfterTool',
  UserPromptSubmit: 'BeforeAgent',
  SessionStart: 'SessionStart',
};
const TOOLS = { Bash: 'run_shell_command', Write: 'write_file', Edit: 'replace', Read: 'read_file' };

const COPY = ['skills', 'architectural-rules', 'hooks', 'docs', 'claude-md/memory-capture.md', 'LICENSE'];
const SKIP = /(^|\/)(tests|node_modules)(\/|$)|\.test\.js$|^hooks\/(hooks\.json|plugin-gate\.js|statusline\.js)$/;

const SCRIPT_RE = /\/hooks\/([\w.-]+\.js)$/;

function mapMatcher(matcher) {
  if (!matcher) return matcher;
  return matcher.replace(/\b(Bash|Write|Edit|Read)\b/g, (name) => TOOLS[name]);
}

function buildHooks(template) {
  const hooks = {};
  for (const bundle of BUNDLES) {
    for (const [event, matchers] of Object.entries(template.hookBundles[bundle] || {})) {
      const geminiEvent = EVENTS[event];
      if (!geminiEvent) throw new Error(`no Gemini event for ${event} (bundle ${bundle})`);
      for (const m of matchers) {
        const entry = {
          ...(m.matcher ? { matcher: mapMatcher(m.matcher) } : {}),
          hooks: m.hooks.map((h) => {
            const script = SCRIPT_RE.exec(h.command.replace(/\\/g, '/'));
            if (!script) throw new Error(`cannot find the hook script in: ${h.command}`);
            return {
              type: 'command',
              command: `node "\${extensionPath}/hooks/${script[1]}"`,
              timeout: (h.timeout || 60) * 1000,
            };
          }),
        };
        (hooks[geminiEvent] = hooks[geminiEvent] || []).push(entry);
      }
    }
  }
  return { hooks };
}

function copy(rel, outDir) {
  const src = path.join(ROOT, rel);
  if (SKIP.test(rel.replace(/\\/g, '/'))) return;
  if (fs.statSync(src).isDirectory()) {
    for (const name of fs.readdirSync(src)) copy(path.join(rel, name), outDir);
    return;
  }
  const dest = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('usage: node scripts/build-gemini-extension.js <outDir>');
    process.exit(1);
  }
  const out = path.resolve(outDir);
  if (out === ROOT || out.startsWith(ROOT + path.sep)) {
    console.error('outDir must be outside the repo');
    process.exit(1);
  }

  fs.rmSync(out, { recursive: true, force: true });
  for (const rel of COPY) copy(rel, out);

  const template = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  const manifest = {
    name: 'contexture',
    version: '1.0.0',
    description: 'Architectural rules primed before coding, a review pass after, safety hooks, and a spec-to-ship workflow.',
  };
  fs.writeFileSync(path.join(out, 'gemini-extension.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'hooks', 'hooks.json'), JSON.stringify(buildHooks(template), null, 2) + '\n');
  console.log(`Gemini extension written to ${out}`);
  console.log(`next: gemini extensions link ${out}`);
}

main();
