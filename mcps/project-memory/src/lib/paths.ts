import { homedir } from "node:os";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PROJECTS_ROOT = join(homedir(), ".claude", "projects");

export interface ProjectMemoryRoot {
  /** The on-disk slug directory name under ~/.claude/projects/. */
  projectSlug: string;
  /** Absolute path to <slug>/memory/. */
  memoryRoot: string;
  /** The cwd ancestor that matched this tier (for diagnostics / warnings). */
  matchedPath: string;
}

export interface ResolveResult {
  /** The nearest (most-specific) tier with a memory tree, or null if none. */
  root: ProjectMemoryRoot | null;
  /**
   * Other tiers (parent dirs / home) that ALSO have memory trees but were not
   * selected, because resolution is nearest-only. Surfaced as a warning so the
   * caller knows these exist and are deliberately not merged.
   */
  shadowedTiers: ProjectMemoryRoot[];
  /**
   * Distinct on-disk slugs that canonicalize to the SAME project as `root`.
   * Non-empty means the project's memory is split across case/separator
   * variants (e.g. `D--Dev-...` and `d--Dev-...`) — a manual-merge warning.
   */
  caseSplitSlugs: string[];
}

/**
 * Canonical form of a path or slug for matching. The slug Claude Code writes is
 * a LOSSY substitution (`replace(/[^A-Za-z0-9]/g, '-')`) over the absolute cwd,
 * and it preserves the original cwd's letter casing — so the same project can
 * appear as `D--Dev-...` or `d--Dev-...` depending on how the path was typed.
 *
 * We therefore never reconstruct the slug; we canonicalize BOTH sides to a
 * case-insensitive, separator-agnostic token string and compare those. This is
 * robust to drive-letter case drift, `\` vs `/`, and trailing separators.
 */
export function canon(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve the layered memory context for a cwd.
 *
 * Walks the cwd's ancestor chain (cwd → parent → … → drive root) plus the home
 * tier (~ via homedir). For each tier, looks up an existing memory tree by
 * canonical-form match against the on-disk project slugs. Resolution is
 * NEAREST-ONLY: the most specific tier wins; other matching tiers are reported
 * as `shadowedTiers` rather than merged.
 */
export function resolveMemoryContext(cwd: string): ResolveResult {
  const empty: ResolveResult = {
    root: null,
    shadowedTiers: [],
    caseSplitSlugs: [],
  };
  if (!existsSync(PROJECTS_ROOT)) return empty;

  const slugs = readDirSafe(PROJECTS_ROOT);
  // Group on-disk slugs by their canonical form so we can detect case-splits.
  const byCanon = new Map<string, string[]>();
  for (const slug of slugs) {
    const c = canon(slug);
    const bucket = byCanon.get(c);
    if (bucket) bucket.push(slug);
    else byCanon.set(c, [slug]);
  }

  const tiers = ancestorTiers(cwd);
  const matched: ProjectMemoryRoot[] = [];

  for (const tierPath of tiers) {
    const c = canon(tierPath);
    const candidateSlugs = byCanon.get(c);
    if (!candidateSlugs) continue;
    // Pick a concrete slug whose memory/ dir exists. Prefer the first with a
    // tree; case-split reporting happens separately below.
    const slug = candidateSlugs.find((s) =>
      existsSync(join(PROJECTS_ROOT, s, "memory")),
    );
    if (!slug) continue;
    matched.push({
      projectSlug: slug,
      memoryRoot: join(PROJECTS_ROOT, slug, "memory"),
      matchedPath: tierPath,
    });
  }

  if (matched.length === 0) return empty;

  const [root, ...shadowedTiers] = matched;

  // Case-split detection for the SELECTED tier: are there sibling slugs that
  // canonicalize identically AND have their own memory tree?
  const rootCanon = canon(root.matchedPath);
  const caseSplitSlugs = (byCanon.get(rootCanon) ?? [])
    .filter(
      (s) =>
        s !== root.projectSlug &&
        existsSync(join(PROJECTS_ROOT, s, "memory")),
    );

  return { root, shadowedTiers, caseSplitSlugs };
}

/**
 * Backwards-compatible single-root resolver. Returns the nearest tree only,
 * discarding layering/warning metadata. Prefer `resolveMemoryContext` in tools
 * that should surface shadowed-tier / case-split warnings.
 */
export function resolveMemoryRoot(cwd: string): ProjectMemoryRoot | null {
  return resolveMemoryContext(cwd).root;
}

/**
 * cwd ancestor chain, nearest-first, bounded at the drive root, plus the home
 * tier appended last (lowest precedence). Splits on both separators so it works
 * regardless of which separator the cwd arrived with.
 */
function ancestorTiers(cwd: string): string[] {
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const tiers: string[] = [];
  // Rebuild progressively-shorter prefixes: full path down to the drive root.
  // parts[0] is the drive (e.g. "d:") on Windows or first segment on POSIX.
  for (let i = parts.length; i >= 1; i--) {
    tiers.push(parts.slice(0, i).join("\\"));
  }

  // Append the home tier (the user's home directory) if not already in the chain.
  const home = homedir();
  if (!tiers.some((t) => canon(t) === canon(home))) {
    tiers.push(home);
  }
  return tiers;
}

function readDirSafe(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (err) {
    // Genuine I/O failure (missing dir, permissions). Surface to stderr rather
    // than silently returning [] — a swallowed error here previously masked an
    // ESM `require is not defined` bug that made the whole resolver dead.
    console.error(`[project-memory] readDirSafe(${dir}) failed:`, err);
    return [];
  }
}
