'use strict';

// Find the project-memory tree for a cwd: ~/.claude/projects/<slug>/memory/.
// Same nearest-tier, case/separator-insensitive match as the project-memory
// MCP (mcps/project-memory/src/lib/paths.ts). Kept small: nearest tier only,
// no shadowed-tier or case-split reporting.

const fs = require('fs');
const os = require('os');
const path = require('path');

function canon(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ancestorTiers(cwd) {
  const parts = String(cwd).split(/[\\/]+/).filter(Boolean);
  const tiers = [];
  for (let i = parts.length; i >= 1; i--) tiers.push(parts.slice(0, i).join('/'));
  return tiers;
}

function memoryRoot(cwd) {
  const projects = path.join(os.homedir(), '.claude', 'projects');
  let slugs;
  try {
    slugs = fs.readdirSync(projects, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return null;
  }
  const byCanon = new Map();
  for (const slug of slugs) {
    const c = canon(slug);
    if (!byCanon.has(c)) byCanon.set(c, []);
    byCanon.get(c).push(slug);
  }
  for (const tier of ancestorTiers(cwd)) {
    for (const slug of byCanon.get(canon(tier)) || []) {
      const dir = path.join(projects, slug, 'memory');
      if (fs.existsSync(dir)) return dir;
    }
  }
  return null;
}

// Every *.md under root except MEMORY.md and _/. prefixed names. Bounded.
function listMemoryFiles(root, cap = 500) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= cap) return;
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.md') && e.name !== 'MEMORY.md') out.push(full);
    }
  };
  walk(root);
  return out;
}

module.exports = { canon, memoryRoot, listMemoryFiles };
