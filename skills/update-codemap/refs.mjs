// File references that are not code imports: links and path spans in markdown, and path
// strings in config files (hooks.json, plugin.json, package.json scripts, yaml). They
// become `## References` edges, kept apart from `## File deps` so they never count as
// importers.

import path from 'node:path';

const REF_EXT = 'js|mjs|cjs|jsx|ts|tsx|py|sh|ps1|bash|rb|go|rs|cs|java|kt|swift|c|cc|cpp|h|hpp|php|md|mdx|json|jsonc|ya?ml|toml|html|css';
const CONFIG_EXT = new Set(['.json', '.jsonc', '.yaml', '.yml', '.toml']);

// A path token: optional `${VAR}/` or `$VAR/` or `./` `../` prefix, segments, a known extension.
const PATH_TOKEN = new RegExp(`(?:\\$\\{\\w+\\}/|\\$\\w+/|\\.{1,2}/)?(?:[\\w@.-]+/)*[\\w@.-]+\\.(?:${REF_EXT})(?![\\w.])`, 'g');

// Raw reference strings in `text`, or [] for a file type that has none.
export function extractRefs(text, rel) {
  const ext = path.posix.extname(rel).toLowerCase();
  const refs = new Set();
  if (ext === '.md' || ext === '.mdx') {
    for (const m of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) refs.add(m[1]);
    for (const m of text.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm)) refs.add(m[1]);
    for (const m of text.matchAll(/`([^`\s]+)`/g)) if (m[1].includes('/')) for (const t of m[1].match(PATH_TOKEN) || []) refs.add(t);
  } else if (CONFIG_EXT.has(ext)) {
    for (const t of text.match(PATH_TOKEN) || []) refs.add(t);
  }
  return [...refs];
}

// The indexed file a raw reference from `sourceRel` points at, or null. Tries the path
// relative to the source's folder, then relative to the repo root. Exact matches only.
export function resolveRef(raw, sourceRel, byRel) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) return null; // URL, mailto:, anchor
  let p = raw.replace(/[#?].*$/, '');
  try { p = decodeURI(p); } catch { /* keep as written */ }
  const isVarRooted = /^\$\{?\w+\}?\//.test(p);
  p = p.replace(/^\$\{?\w+\}?\//, '');
  if (!p) return null;
  const dir = path.posix.dirname(sourceRel);
  const cands = p.startsWith('/') || isVarRooted
    ? [p.replace(/^\/+/, '')]
    : [path.posix.join(dir, p), path.posix.normalize(p)];
  for (const c of cands) {
    const rel = path.posix.normalize(c);
    if (rel !== sourceRel && !rel.startsWith('..') && byRel.has(rel)) return rel;
  }
  return null;
}
