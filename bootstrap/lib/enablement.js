'use strict';

// Enablement: read ~/.claude/hook-config.json's `enabled` block, decide
// what gets linked and what hook bundles get registered. Per proposal 034a.
//
// Two halves of the schema:
//   enabled.skills   = { exclude: [<entry-name>...] }    (per-subtree)
//   enabled.agents   = { exclude: [...] }
//   enabled.commands = { exclude: [...] }
//   enabled.hookBundles = { security: bool, gitDiscipline: bool, bootstrapDrift: bool }
//
// First-run discipline: if hook-config.json has no `enabled` block, write
// the solo defaults (everything on, nothing excluded) and continue. The
// config file is the truth from then on; no "first-run mode" or installer
// flag — bootstrap is idempotent in both directions (link and unlink).
//
// Malformed JSON is a loud failure (open-question 5 in the proposal). The
// file is now load-bearing; silently falling through to defaults would
// silently re-link entries the user excluded.

const fs = require('fs');
const path = require('path');

const FILTERABLE_SUBTREES = ['skills', 'agents', 'commands'];

const DEFAULT_ENABLED = {
  skills: { exclude: [] },
  agents: { exclude: [] },
  commands: { exclude: [] },
  hookBundles: {
    security: true,
    gitDiscipline: true,
    bootstrapDrift: true,
    agentOutputContracts: true,
    codemapDirty: true,
    sessionGuard: true,
  },
};

function loadEnablement({ homeClaude }) {
  const configPath = path.join(homeClaude, 'hook-config.json');
  let config;
  let rawExisted = false;
  if (fs.existsSync(configPath)) {
    rawExisted = true;
    let raw;
    try {
      raw = fs.readFileSync(configPath, 'utf8');
    } catch (err) {
      throw new Error(`failed to read ${configPath}: ${err.message}`);
    }
    try {
      config = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `${configPath} is not valid JSON: ${err.message}. ` +
          `bootstrap refuses to proceed because this file controls what gets linked and registered. ` +
          `fix the file and re-run.`
      );
    }
  } else {
    config = {};
  }

  const seeded = !config.enabled;
  if (seeded) {
    config.enabled = clone(DEFAULT_ENABLED);
    fs.mkdirSync(homeClaude, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  } else {
    // Existing block: backfill any missing keys with defaults so callers
    // can rely on the shape without null-checking each field.
    config.enabled = mergeWithDefaults(config.enabled);
  }

  return {
    enabled: config.enabled,
    seeded,
    rawExisted,
    configPath,
  };
}

function mergeWithDefaults(enabled) {
  const out = clone(DEFAULT_ENABLED);
  for (const key of FILTERABLE_SUBTREES) {
    if (enabled[key] && Array.isArray(enabled[key].exclude)) {
      out[key] = { exclude: enabled[key].exclude.slice() };
    }
  }
  if (enabled.hookBundles && typeof enabled.hookBundles === 'object') {
    out.hookBundles = { ...DEFAULT_ENABLED.hookBundles, ...enabled.hookBundles };
  }
  return out;
}

function excludeFor(enabled, subtreeName) {
  if (!FILTERABLE_SUBTREES.includes(subtreeName)) return [];
  return (enabled[subtreeName] && enabled[subtreeName].exclude) || [];
}

function isFilterable(subtreeName) {
  return FILTERABLE_SUBTREES.includes(subtreeName);
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

module.exports = {
  loadEnablement,
  excludeFor,
  isFilterable,
  FILTERABLE_SUBTREES,
  DEFAULT_ENABLED,
};
