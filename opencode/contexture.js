// OpenCode plugin: runs contexture's hooks under OpenCode, for local models.
// OpenCode has no command hooks, so this file calls the same hook scripts with
// Claude-shaped payloads. Link it into ~/.config/opencode/plugins/ (README,
// "Local models"). Turn a bundle off with CLAUDE_PLUGIN_OPTION_<BUNDLE>=false.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))), '..');
const GATE = path.join(ROOT, 'hooks', 'plugin-gate.js');
const TEMPLATE = path.join(ROOT, 'settings', 'settings.template.json');

// Same set as the Gemini build: the rest read Claude transcripts or its Agent tool.
const BUNDLES = ['security', 'gitDiscipline', 'codemapDirty', 'rulePrime'];
const TOOLS = { bash: 'Bash', write: 'Write', edit: 'Edit', read: 'Read' };
const SCRIPT_RE = /\/hooks\/([\w.-]+\.js)$/;

function loadHooks() {
  const template = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  const out = [];
  for (const bundle of BUNDLES) {
    for (const [event, matchers] of Object.entries(template.hookBundles[bundle] || {})) {
      for (const m of matchers) {
        const matcher = m.matcher ? new RegExp(`^(${m.matcher})$`) : null;
        for (const h of m.hooks) {
          const script = SCRIPT_RE.exec(h.command.replace(/\\/g, '/'));
          if (script) out.push({ bundle, event, matcher, script: script[1], timeout: (h.timeout || 60) * 1000 });
        }
      }
    }
  }
  return out;
}

function claudeInput(args) {
  const input = { ...args };
  if (args && args.filePath) input.file_path = args.filePath;
  return input;
}

function contextOf(stdout) {
  try {
    return JSON.parse(stdout).hookSpecificOutput.additionalContext || '';
  } catch {
    return '';
  }
}

export const Contexture = async ({ directory }) => {
  const hooks = loadHooks();
  const primed = new Map(); // sessionID -> context strings for the system prompt

  // Returns the hooks' context lines. Throws when a hook blocks (exit 2).
  function run(event, key, payload) {
    const context = [];
    for (const h of hooks) {
      if (h.event !== event || (h.matcher && !h.matcher.test(key))) continue;
      const r = spawnSync('node', [GATE, h.bundle, h.script], {
        input: JSON.stringify({ hook_event_name: event, cwd: directory, ...payload }),
        encoding: 'utf8',
        timeout: h.timeout,
        env: { ...process.env, CLAUDE_PROJECT_DIR: directory },
      });
      if (r.status === 2) throw new Error((r.stderr || '').trim() || `blocked by ${h.script}`);
      const text = contextOf(r.stdout || '');
      if (text) context.push(text);
    }
    return context;
  }

  function sessionContext(sessionID) {
    if (!primed.has(sessionID)) {
      primed.set(sessionID, run('SessionStart', 'startup', { session_id: sessionID, source: 'startup' }));
    }
    return primed.get(sessionID);
  }

  return {
    'tool.execute.before': async (input, output) => {
      const tool = TOOLS[input.tool];
      if (!tool) return;
      run('PreToolUse', tool, { session_id: input.sessionID, tool_name: tool, tool_input: claudeInput(output.args) });
    },

    'tool.execute.after': async (input) => {
      const tool = TOOLS[input.tool];
      if (!tool) return;
      run('PostToolUse', tool, { session_id: input.sessionID, tool_name: tool, tool_input: claudeInput(input.args) });
    },

    // Rules matched by each prompt join the session's context for later turns.
    'chat.message': async (input, output) => {
      const prompt = (output.parts || [])
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
      if (!prompt) return;
      const context = sessionContext(input.sessionID);
      context.push(...run('UserPromptSubmit', '', { session_id: input.sessionID, prompt }));
    },

    'experimental.chat.system.transform': async (input, output) => {
      if (!input.sessionID) return;
      output.system.push(...sessionContext(input.sessionID));
    },
  };
};
