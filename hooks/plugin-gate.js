#!/usr/bin/env node
'use strict';

// Plugin-mode entry for every bundled hook: `plugin-gate.js <bundle> <script>`.
// Runs <script> only when the bundle's plugin option is on. Bootstrap installs
// don't use this file; they toggle bundles in ~/.claude/hook-config.json.
//
// The option is read from CLAUDE_PLUGIN_OPTION_<KEY>, where <KEY> is the bundle
// name in snake_case. Unset falls back to the userConfig default in plugin.json.

const fs = require('fs');
const path = require('path');

const [bundle, script] = process.argv.slice(2);
if (!bundle || !script) process.exit(0);

const key = bundle.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

function enabled() {
  const raw = process.env['CLAUDE_PLUGIN_OPTION_' + key.toUpperCase()];
  if (raw !== undefined && raw !== '') return !/^(false|0|no|off)$/i.test(raw.trim());
  try {
    const manifest = path.join(__dirname, '..', '.claude-plugin', 'plugin.json');
    const opt = JSON.parse(fs.readFileSync(manifest, 'utf8')).userConfig[key];
    return opt ? opt.default !== false : true;
  } catch {
    return true;
  }
}

if (!enabled()) process.exit(0);
require(path.join(__dirname, path.basename(script)));
