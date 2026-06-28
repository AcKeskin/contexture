'use strict';

// Register repo-owned MCP servers into ~/.claude.json's mcpServers map.
// Idempotent and coexistent — peer MCPs (context7, UnityMCP, etc.) are left
// alone; we only touch entries that match our manifest. Removing an MCP from
// the manifest does NOT unregister it (user-owned entries are sacred — if
// they want it gone, they run `claude mcp remove <name>` themselves).
//
// Per the Phase 1 ship criteria: bootstrap registers it into
// ~/.claude.json. Today's manifest is just project-memory; future MCPs
// under mcps/ get added here as they ship.

const fs = require('fs');
const path = require('path');

// Manifest: which repo-owned MCPs to register. Build artefact path is
// resolved relative to repoRoot at registration time. Each entry's `enabled`
// flag is a future hook for the enablement skill — defaults to true.
const MCP_MANIFEST = [
  {
    name: 'project-memory',
    relativeBuildPath: 'mcps/project-memory/build/index.js',
    runtime: 'node',
    enabled: true,
    description: 'Retrieval-only MCP over project memory tree + session rollups',
  },
];

function registerMcps({ repoRoot, homeDir, dryRun }) {
  const configPath = path.join(homeDir, '.claude.json');
  const results = [];

  // ~/.claude.json must exist — created by Claude Code itself on first run.
  // If absent, that's a fresh / broken install; surface the issue rather
  // than create a partial config that confuses Claude Code's own loader.
  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      reason: `~/.claude.json not found at ${configPath}. Run Claude Code at least once before bootstrap.`,
      results: [],
    };
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      reason: `failed to parse ${configPath}: ${err.message}`,
      results: [],
    };
  }

  const current = isPlainObject(config.mcpServers) ? config.mcpServers : {};
  const next = { ...current };
  let changed = false;

  for (const entry of MCP_MANIFEST) {
    if (!entry.enabled) {
      results.push({ name: entry.name, action: 'skipped (disabled in manifest)' });
      continue;
    }

    const buildPath = path.join(repoRoot, entry.relativeBuildPath);
    if (!fs.existsSync(buildPath)) {
      results.push({
        name: entry.name,
        action: 'skipped (build artefact missing — run `npm run build` in the MCP project)',
        buildPath,
      });
      continue;
    }

    const desired = {
      type: 'stdio',
      command: entry.runtime,
      args: [normalisePath(buildPath)],
      env: {},
    };

    const existing = next[entry.name];
    if (existing && deepEqual(existing, desired)) {
      results.push({ name: entry.name, action: 'up-to-date' });
      continue;
    }

    next[entry.name] = desired;
    changed = true;
    results.push({
      name: entry.name,
      action: existing ? 'updated' : 'registered',
    });
  }

  if (!changed) {
    return { ok: true, action: 'no-op', results };
  }

  if (dryRun) {
    return { ok: true, action: 'would-write', results };
  }

  config.mcpServers = next;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  return { ok: true, action: 'written', results };
}

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length) return false;
    return ak.every((k, i) => k === bk[i] && deepEqual(a[k], b[k]));
  }
  return false;
}

// ~/.claude.json on Windows stores paths with forward slashes per
// claude-mem-style conventions. Normalise here so the registration matches
// what `claude mcp add` would write — keeps the idempotency check honest.
function normalisePath(p) {
  return p.split('\\').join('/');
}

module.exports = { registerMcps, MCP_MANIFEST };
